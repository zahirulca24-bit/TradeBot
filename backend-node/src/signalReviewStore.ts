import { z } from 'zod';
import {
  buildReviewFingerprint,
  SignalReviewPolicyEngine,
  signalReviewRecordSchema,
  signalReviewRequestSchema,
  type SignalReviewRecord,
  type SignalReviewRequest,
} from './signalReview.js';

const signalRowSchema = z.object({
  signal_candidate_key: z.string(),
  symbol: z.string(),
  direction: z.enum(['LONG', 'SHORT']),
  entry_price: z.coerce.number().positive(),
  stop_loss: z.coerce.number().positive(),
  target_price: z.coerce.number().positive(),
  risk_reward_ratio: z.coerce.number().min(2),
  entry_candle_close_time_ms: z.coerce.number().int().positive(),
  last_seen_at: z.string().datetime(),
  evidence: z.record(z.unknown()),
});

const reviewRowSchema = z.object({
  id: z.string(),
  signal_candidate_key: z.string(),
  review_state: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']),
  reviewer: z.string().nullable(),
  reason: z.string().nullable(),
  reviewed_at: z.string().datetime().nullable(),
  expires_at: z.string().datetime(),
  actionable: z.literal(false),
  execution_enabled: z.literal(false),
});

const rpcSchema = z.array(z.object({
  replayed: z.boolean(),
  review: reviewRowSchema,
  audit: z.record(z.unknown()),
})).length(1);

export interface SignalReviewStoreOptions {
  supabaseUrl: string;
  secretKey: string;
  ttlMs: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class SignalReviewStore {
  private readonly url: string;
  private readonly key: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly policy: SignalReviewPolicyEngine;

  public constructor(options: SignalReviewStoreOptions) {
    this.url = new URL(options.supabaseUrl).toString().replace(/\/$/, '');
    this.key = options.secretKey.trim();
    if (this.key.length < 32) throw new Error('INVALID_SUPABASE_SECRET_KEY');
    this.timeoutMs = options.requestTimeoutMs ?? 8_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.policy = new SignalReviewPolicyEngine({ ttlMs: options.ttlMs, now: options.now });
  }

  public async detail(signalCandidateKey: string) {
    const key = z.string().min(1).max(240).parse(signalCandidateKey);
    const signals = z.array(signalRowSchema).parse(await this.request(
      `/rest/v1/trade_signals?signal_candidate_key=eq.${encodeURIComponent(key)}&select=*&limit=1`,
      { method: 'GET' },
    ));
    const signal = signals[0];
    if (!signal) throw new Error('SIGNAL_NOT_FOUND');

    const reviews = z.array(reviewRowSchema).parse(await this.request(
      `/rest/v1/signal_reviews?signal_candidate_key=eq.${encodeURIComponent(key)}&select=*&limit=1`,
      { method: 'GET' },
    ));
    const freshness = this.policy.evaluateFreshness({
      signalCandidateKey: key,
      lastSeenAt: signal.last_seen_at,
      entryCandleCloseTimeMs: signal.entry_candle_close_time_ms,
    });

    return {
      signal: {
        signalCandidateKey: signal.signal_candidate_key,
        symbol: signal.symbol,
        direction: signal.direction,
        entryPrice: signal.entry_price,
        stopLoss: signal.stop_loss,
        targetPrice: signal.target_price,
        riskRewardRatio: signal.risk_reward_ratio,
        entryCandleCloseTimeMs: signal.entry_candle_close_time_ms,
        lastSeenAt: signal.last_seen_at,
        evidence: signal.evidence,
      },
      review: reviews[0] ? this.mapReview(reviews[0]) : null,
      freshness,
      actionable: false,
      executionEnabled: false,
    } as const;
  }

  public async review(input: SignalReviewRequest) {
    const request = signalReviewRequestSchema.parse(input);
    const detail = await this.detail(request.signalCandidateKey);
    if (detail.signal.lastSeenAt !== request.observedLastSeenAt) {
      throw new Error('SIGNAL_VERSION_CONFLICT');
    }
    if (detail.freshness.stale) throw new Error('STALE_SIGNAL_REVIEW_BLOCKED');

    const payload = rpcSchema.parse(await this.request('/rest/v1/rpc/review_trade_signal', {
      method: 'POST',
      body: JSON.stringify({
        p_signal_candidate_key: request.signalCandidateKey,
        p_action: request.action,
        p_reviewer: request.reviewer,
        p_reason: request.reason,
        p_observed_last_seen_at: request.observedLastSeenAt,
        p_expires_at: detail.freshness.expiresAt,
        p_idempotency_key: request.idempotencyKey,
        p_request_fingerprint: buildReviewFingerprint(request),
      }),
    }))[0];

    if (!payload) throw new Error('SIGNAL_REVIEW_RPC_EMPTY_RESPONSE');
    return {
      replayed: payload.replayed,
      review: this.mapReview(payload.review),
      actionable: false,
      executionEnabled: false,
    } as const;
  }

  private mapReview(row: z.infer<typeof reviewRowSchema>): SignalReviewRecord {
    return signalReviewRecordSchema.parse({
      reviewId: row.id,
      signalCandidateKey: row.signal_candidate_key,
      state: row.review_state,
      reviewer: row.reviewer,
      reason: row.reason,
      reviewedAt: row.reviewed_at,
      expiresAt: row.expires_at,
      stale: Date.now() >= Date.parse(row.expires_at),
      actionable: false,
      executionEnabled: false,
    });
  }

  private headers() {
    return {
      accept: 'application/json',
      apikey: this.key,
      authorization: `Bearer ${this.key}`,
      'content-type': 'application/json',
    };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.url}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error('SIGNAL_REVIEW_STORE_UNREACHABLE', { cause: error });
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const match = body.match(/(SIGNAL_[A-Z_]+|STALE_SIGNAL_REVIEW_BLOCKED|IDEMPOTENCY_KEY_CONFLICT)/);
      throw new Error(match?.[1] ?? `SIGNAL_REVIEW_STORE_HTTP_${response.status}`);
    }
    const type = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!type.includes('application/json')) throw new Error('SIGNAL_REVIEW_STORE_NON_JSON_RESPONSE');
    return response.json();
  }
}
