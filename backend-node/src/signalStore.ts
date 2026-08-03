import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const signalDirectionSchema = z.enum(['LONG', 'SHORT']);
const signalStatusSchema = z.literal('VALID');
const executionStatusSchema = z.literal('NOT_EXECUTED');

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

const signalStoreDocumentSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime(),
  signals: z.array(storedSignalSchema),
});

export type StoredSignal = z.infer<typeof storedSignalSchema>;

export interface SignalCandidateInput {
  signalCandidateKey: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskRewardRatio: number;
  riskBps: number;
  volumeRatio: number;
  sweepDepthBps: number;
  entryCandleCloseTimeMs: number;
  swingCandleCloseTimeMs: number;
  reasons: string[];
  candidateRank: number;
}

interface SignalStoreDocument {
  version: 1;
  updatedAt: string;
  signals: StoredSignal[];
}

export interface SignalUpsertResult {
  insertedCount: number;
  duplicateSuppressedCount: number;
  inserted: StoredSignal[];
  duplicates: StoredSignal[];
  totalStored: number;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function emptyDocument(now: string): SignalStoreDocument {
  return { version: 1, updatedAt: now, signals: [] };
}

export class SignalStore {
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly absolutePath: string;

  public constructor(filePath: string) {
    const normalized = filePath.trim();
    if (!normalized) throw new Error('INVALID_SIGNAL_STORE_PATH');
    this.absolutePath = resolve(normalized);
  }

  public storageInfo() {
    return {
      mode: 'ATOMIC_JSON_FILE',
      crossCycleDuplicateKey: 'signalCandidateKey',
      processWriteSerialization: true,
      deploymentDurability: 'REQUIRES_PERSISTENT_FILESYSTEM_OR_RENDER_DISK',
    } as const;
  }

  public async list(limit = 100): Promise<StoredSignal[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('INVALID_SIGNAL_LIST_LIMIT');
    }

    return this.serialized(async () => {
      const document = await this.readDocument();
      return [...document.signals]
        .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
        .slice(0, limit);
    });
  }

  public async upsert(
    candidates: SignalCandidateInput[],
    observedAt: string,
  ): Promise<SignalUpsertResult> {
    const parsedTime = z.string().datetime().safeParse(observedAt);
    if (!parsedTime.success) throw new Error('INVALID_SIGNAL_OBSERVED_AT');

    return this.serialized(async () => {
      const document = await this.readDocument(observedAt);
      const byKey = new Map(document.signals.map((signal) => [signal.signalCandidateKey, signal]));
      const inserted: StoredSignal[] = [];
      const duplicates: StoredSignal[] = [];
      const seenInRequest = new Set<string>();

      for (const candidate of candidates) {
        if (seenInRequest.has(candidate.signalCandidateKey)) {
          const existing = byKey.get(candidate.signalCandidateKey);
          if (existing) duplicates.push(existing);
          continue;
        }
        seenInRequest.add(candidate.signalCandidateKey);

        const current = byKey.get(candidate.signalCandidateKey);
        if (current) {
          const updated: StoredSignal = storedSignalSchema.parse({
            ...current,
            lastSeenAt: observedAt,
            seenCount: current.seenCount + 1,
          });
          byKey.set(candidate.signalCandidateKey, updated);
          duplicates.push(updated);
          continue;
        }

        const created: StoredSignal = storedSignalSchema.parse({
          ...candidate,
          status: 'VALID',
          executionStatus: 'NOT_EXECUTED',
          createdAt: observedAt,
          lastSeenAt: observedAt,
          seenCount: 1,
          actionable: false,
        });
        byKey.set(candidate.signalCandidateKey, created);
        inserted.push(created);
      }

      const nextSignals = [...byKey.values()].sort((left, right) =>
        right.lastSeenAt.localeCompare(left.lastSeenAt),
      );
      const nextDocument: SignalStoreDocument = {
        version: 1,
        updatedAt: observedAt,
        signals: nextSignals,
      };

      await this.writeDocument(nextDocument);
      return {
        insertedCount: inserted.length,
        duplicateSuppressedCount: duplicates.length,
        inserted,
        duplicates,
        totalStored: nextSignals.length,
      };
    });
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(operation, operation);
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async readDocument(now = new Date().toISOString()): Promise<SignalStoreDocument> {
    let raw: string;
    try {
      raw = await readFile(this.absolutePath, 'utf8');
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return emptyDocument(now);
      throw new Error('SIGNAL_STORE_READ_FAILED', { cause: error });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      throw new Error('SIGNAL_STORE_CORRUPT', { cause: error });
    }

    const parsed = signalStoreDocumentSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error('SIGNAL_STORE_CORRUPT', { cause: parsed.error });
    }
    return parsed.data;
  }

  private async writeDocument(document: SignalStoreDocument): Promise<void> {
    const parsed = signalStoreDocumentSchema.parse(document);
    const directory = dirname(this.absolutePath);
    const temporaryPath = `${this.absolutePath}.${process.pid}.${randomUUID()}.tmp`;

    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await rename(temporaryPath, this.absolutePath);
    } catch (error) {
      throw new Error('SIGNAL_STORE_WRITE_FAILED', { cause: error });
    }
  }
}
