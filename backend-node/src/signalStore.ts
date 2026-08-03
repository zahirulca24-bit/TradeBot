import { z } from 'zod';

const signalDirectionSchema = z.enum(['LONG', 'SHORT']);
const signalStatusSchema = z.literal('VALID');
const executionStatusSchema = z.literal('NOT_EXECUTED');

const signalEvidenceSchema = z.object({
  volumeRatio: z.number().positive(),
  sweepDepthBps: z.number().nonnegative(),
  reasons: z.array(z.string().min(1)).min(1),
  candidateRank: z.number().int().min(1).max(3),
});

const storedSignalSchema = z.object({
  signalCandidateKey: z.string().min(1).max(240),
  symbol: z.string().regex(/^[A-Z0-9]{3,30}$/),
  direction: signalDirectionSchema,
  status: signalStatusSchema,
  executionStatus: executionStatusSchema,
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  targetPrice: z.number().positive(),
  riskRewardRatio: z.number().min(2),
  riskBps: z.number().positive(),
  volumeRatio: z.number().positive(),
  sweepDepthBps: z.number().nonnegative(),
  entryCandleCloseTimeMs: z.number().int().positive(),
  swingCandleCloseTimeMs: z.number().int().positive(),
  reasons: z.array(z.string().min(1)).min(1),
  candidateRank: z.number().int().min(1).max(3),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  seenCount: z.number().int().min(1),
  actionable: z.literal(false),
});

const signalCandidateSchema = z.object({
  signalCandidateKey: z.string().min(1).max(240),
  symbol: z.string().regex(/^[A-Z0-9]{3,30}$/),
  direction: signalDirectionSchema,
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  targetPrice: z.number().positive(),
  riskDistance: z.number().positive(),
  riskRewardRatio: z.number().min(2),
  riskBps: z.number().positive(),
  swingPrice: z.number().positive(),
  swingAgeCandles: z.number().int().min(1),
  entryKey: z.string().min(1).max(240),
  volumeRatio: z.number().positive(),
  sweepDepthBps: z.number().nonnegative(),
  entryCandleCloseTimeMs: z.number().int().positive(),
  swingCandleCloseTimeMs: z.number().int().positive(),
  reasons: z.array(z.string().min(1)).min(1),
  candidateRank: z.number().int().min(1).max(3),
});

const databaseSignalSchema = z.object({
  signal_candidate_key: z.string().min(1).max(240),
  symbol: z.string().regex(/^[A-Z0-9]{3,30}$/),
  direction: signalDirectionSchema,
  entry_price: z.coerce.number().positive(),
  stop_loss: z.coerce.number().positive(),
  target_price: z.coerce.number().positive(),
  risk_distance: z.coerce.number().positive(),
  risk_bps: z.coerce.number().positive(),
  risk_reward_ratio: z.coerce.number().min(2),
  entry_candle_close_time_ms: z.coerce.number().int().positive(),
  swing_price: z.coerce.number().positive(),
  swing_candle_close_time_ms: z.coerce.number().int().positive(),
  swing_age_candles: z.coerce.number().int().min(1),
  entry_key: z.string().min(1),
  evidence: signalEvidenceSchema,
  seen_count: z.coerce.number().int().min(1),
  first_seen_at: z.string().datetime(),
  last_seen_at: z.string().datetime(),
  actionable: z.literal(false),
  execution_enabled: z.literal(false),
});

const rpcResponseSchema = z.array(
  z.object({
    inserted: z.boolean(),
    signal: databaseSignalSchema,
  }),
).length(1);

export type StoredSignal = z.infer<typeof storedSignalSchema>;
export type SignalCandidateInput = z.infer<typeof signalCandidateSchema>;

type FetchLike = typeof fetch;

export interface SignalStoreOptions {
  supabaseUrl: string;
  secretKey: string;
  requestTimeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface SignalUpsertResult {
  insertedCount: number;
  duplicateSuppressedCount: number;
  inserted: StoredSignal[];
  duplicates: StoredSignal[];
  totalStored: number;
}

function normalizeSupabaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('INVALID_SUPABASE_URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('INVALID_SUPABASE_URL');
  return parsed.toString().replace(/\/$/, '');
}

function optionsFromEnvironment(): SignalStoreOptions {
  const timeout = Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS ?? 8_000);
  return {
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    secretKey: process.env.SUPABASE_SECRET_KEY ?? '',
    requestTimeoutMs: timeout,
  };
}

function mapDatabaseSignal(value: unknown): StoredSignal {
  const row = databaseSignalSchema.parse(value);
  return storedSignalSchema.parse({
    signalCandidateKey: row.signal_candidate_key,
    symbol: row.symbol,
    direction: row.direction,
    status: 'VALID',
    executionStatus: 'NOT_EXECUTED',
    entryPrice: row.entry_price,
    stopLoss: row.stop_loss,
    targetPrice: row.target_price,
    riskRewardRatio: row.risk_reward_ratio,
    riskBps: row.risk_bps,
    volumeRatio: row.evidence.volumeRatio,
    sweepDepthBps: row.evidence.sweepDepthBps,
    entryCandleCloseTimeMs: row.entry_candle_close_time_ms,
    swingCandleCloseTimeMs: row.swing_candle_close_time_ms,
    reasons: row.evidence.reasons,
    candidateRank: row.evidence.candidateRank,
    createdAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    seenCount: row.seen_count,
    actionable: false,
  });
}

function normalizeFetchError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new Error('SUPABASE_SIGNAL_STORE_TIMEOUT');
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error('SUPABASE_SIGNAL_STORE_TIMEOUT');
  }
  return new Error('SUPABASE_SIGNAL_STORE_UNREACHABLE', { cause: error });
}

export class SignalStore {
  private readonly supabaseUrl: string;
  private readonly secretKey: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: FetchLike;

  public constructor(options: SignalStoreOptions | string) {
    const resolvedOptions = typeof options === 'string' ? optionsFromEnvironment() : options;
    this.supabaseUrl = normalizeSupabaseUrl(resolvedOptions.supabaseUrl);
    this.secretKey = resolvedOptions.secretKey.trim();
    if (this.secretKey.length < 32) throw new Error('INVALID_SUPABASE_SECRET_KEY');
    this.requestTimeoutMs = resolvedOptions.requestTimeoutMs ?? 8_000;
    if (!Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1_000 || this.requestTimeoutMs > 20_000) {
      throw new Error('INVALID_SUPABASE_REQUEST_TIMEOUT');
    }
    this.fetchImpl = resolvedOptions.fetchImpl ?? fetch;
  }

  public storageInfo() {
    return {
      mode: 'SUPABASE_POSTGRES',
      table: 'public.trade_signals',
      crossCycleDuplicateKey: 'signal_candidate_key',
      duplicateMutation: 'ATOMIC_RPC_SEEN_COUNT_INCREMENT',
      deploymentDurability: 'MANAGED_POSTGRES_PERSISTENCE',
      clientExposure: false,
    } as const;
  }

  public async checkReady() {
    await this.count();
    return {
      ready: true,
      mode: 'SUPABASE_POSTGRES',
      table: 'public.trade_signals',
    } as const;
  }

  public async list(limit = 100): Promise<StoredSignal[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('INVALID_SIGNAL_LIST_LIMIT');
    }

    const payload = await this.requestJson(
      `/rest/v1/trade_signals?select=*&order=last_seen_at.desc&limit=${limit}`,
      { method: 'GET' },
    );
    const rows = z.array(databaseSignalSchema).parse(payload);
    return rows.map(mapDatabaseSignal);
  }

  public async upsert(
    candidates: SignalCandidateInput[],
    observedAt: string,
  ): Promise<SignalUpsertResult> {
    const parsedTime = z.string().datetime().safeParse(observedAt);
    if (!parsedTime.success) throw new Error('INVALID_SIGNAL_OBSERVED_AT');

    const parsedCandidates = z.array(signalCandidateSchema).max(3).parse(candidates);
    const inserted: StoredSignal[] = [];
    const duplicates: StoredSignal[] = [];
    const processed = new Map<string, StoredSignal>();

    for (const candidate of parsedCandidates) {
      const alreadyProcessed = processed.get(candidate.signalCandidateKey);
      if (alreadyProcessed) {
        duplicates.push(alreadyProcessed);
        continue;
      }

      const payload = await this.requestJson('/rest/v1/rpc/upsert_trade_signal', {
        method: 'POST',
        body: JSON.stringify({
          p_signal: {
            signal_candidate_key: candidate.signalCandidateKey,
            symbol: candidate.symbol,
            direction: candidate.direction,
            entry_price: candidate.entryPrice,
            stop_loss: candidate.stopLoss,
            target_price: candidate.targetPrice,
            risk_distance: candidate.riskDistance,
            risk_bps: candidate.riskBps,
            risk_reward_ratio: candidate.riskRewardRatio,
            entry_candle_close_time_ms: candidate.entryCandleCloseTimeMs,
            swing_price: candidate.swingPrice,
            swing_candle_close_time_ms: candidate.swingCandleCloseTimeMs,
            swing_age_candles: candidate.swingAgeCandles,
            entry_key: candidate.entryKey,
            evidence: {
              volumeRatio: candidate.volumeRatio,
              sweepDepthBps: candidate.sweepDepthBps,
              reasons: candidate.reasons,
              candidateRank: candidate.candidateRank,
            },
          },
          p_observed_at: observedAt,
        }),
      });

      const result = rpcResponseSchema.parse(payload)[0];
      if (!result) throw new Error('SUPABASE_SIGNAL_RPC_EMPTY_RESPONSE');
      const stored = mapDatabaseSignal(result.signal);
      processed.set(candidate.signalCandidateKey, stored);
      if (result.inserted) inserted.push(stored);
      else duplicates.push(stored);
    }

    return {
      insertedCount: inserted.length,
      duplicateSuppressedCount: duplicates.length,
      inserted,
      duplicates,
      totalStored: await this.count(),
    };
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      accept: 'application/json',
      apikey: this.secretKey,
      authorization: `Bearer ${this.secretKey}`,
      'content-type': 'application/json',
      ...extra,
    };
  }

  private async count(): Promise<number> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.supabaseUrl}/rest/v1/trade_signals?select=id&limit=1`, {
        method: 'GET',
        headers: this.headers({ prefer: 'count=exact' }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      throw normalizeFetchError(error);
    }

    if (!response.ok) throw this.httpError(response.status);
    const contentRange = response.headers.get('content-range');
    const totalText = contentRange?.split('/')[1];
    const total = totalText === undefined ? Number.NaN : Number(totalText);
    if (!Number.isInteger(total) || total < 0) throw new Error('SUPABASE_SIGNAL_COUNT_INVALID');
    return total;
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.supabaseUrl}${path}`, {
        ...init,
        headers: this.headers(init.headers as Record<string, string> | undefined),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      throw normalizeFetchError(error);
    }

    if (!response.ok) throw this.httpError(response.status);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) {
      throw new Error('SUPABASE_SIGNAL_STORE_NON_JSON_RESPONSE');
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error('SUPABASE_SIGNAL_STORE_INVALID_JSON', { cause: error });
    }
  }

  private httpError(status: number): Error {
    if (status === 401 || status === 403) return new Error('SUPABASE_SIGNAL_STORE_AUTH_FAILED');
    if (status === 404) return new Error('SUPABASE_SIGNAL_STORE_SCHEMA_MISSING');
    return new Error(`SUPABASE_SIGNAL_STORE_HTTP_${status}`);
  }
}
