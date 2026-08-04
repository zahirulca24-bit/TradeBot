import { createHash } from 'node:crypto';
import { z } from 'zod';

export const signalReviewStateSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
export type SignalReviewState = z.infer<typeof signalReviewStateSchema>;

export const signalReviewActionSchema = z.enum(['APPROVE', 'REJECT']);
export type SignalReviewAction = z.infer<typeof signalReviewActionSchema>;

export const signalReviewRequestSchema = z.object({
  signalCandidateKey: z.string().min(1).max(240),
  action: signalReviewActionSchema,
  idempotencyKey: z.string().min(16).max(160),
  reviewer: z.string().min(1).max(120),
  reason: z.string().trim().min(3).max(500),
  observedLastSeenAt: z.string().datetime(),
});
export type SignalReviewRequest = z.infer<typeof signalReviewRequestSchema>;

export const signalReviewRecordSchema = z.object({
  reviewId: z.string().min(1),
  signalCandidateKey: z.string().min(1).max(240),
  state: signalReviewStateSchema,
  reviewer: z.string().min(1).max(120).nullable(),
  reason: z.string().max(500).nullable(),
  reviewedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
  stale: z.boolean(),
  actionable: z.literal(false),
  executionEnabled: z.literal(false),
});
export type SignalReviewRecord = z.infer<typeof signalReviewRecordSchema>;

export interface SignalFreshnessInput {
  signalCandidateKey: string;
  lastSeenAt: string;
  entryCandleCloseTimeMs: number;
}

export interface SignalReviewPolicy {
  ttlMs: number;
  now?: () => number;
}

export interface SignalFreshnessDecision {
  stale: boolean;
  expiresAt: string;
  reason: 'SIGNAL_FRESH' | 'SIGNAL_EXPIRED' | 'SIGNAL_LAST_SEEN_INVALID' | 'SIGNAL_ENTRY_TIME_INVALID';
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

export class SignalReviewPolicyEngine {
  private readonly now: () => number;

  public constructor(private readonly policy: SignalReviewPolicy) {
    if (!Number.isInteger(policy.ttlMs) || policy.ttlMs < 60_000 || policy.ttlMs > 24 * 60 * 60 * 1000) {
      throw new Error('INVALID_SIGNAL_REVIEW_TTL');
    }
    this.now = policy.now ?? Date.now;
  }

  public evaluateFreshness(signal: SignalFreshnessInput): SignalFreshnessDecision {
    const lastSeenMs = Date.parse(signal.lastSeenAt);
    if (!Number.isFinite(lastSeenMs)) {
      return { stale: true, expiresAt: iso(this.now()), reason: 'SIGNAL_LAST_SEEN_INVALID' };
    }
    if (!Number.isInteger(signal.entryCandleCloseTimeMs) || signal.entryCandleCloseTimeMs <= 0) {
      return { stale: true, expiresAt: iso(this.now()), reason: 'SIGNAL_ENTRY_TIME_INVALID' };
    }

    const freshnessAnchor = Math.max(lastSeenMs, signal.entryCandleCloseTimeMs);
    const expiresAtMs = freshnessAnchor + this.policy.ttlMs;
    const stale = this.now() >= expiresAtMs;
    return {
      stale,
      expiresAt: iso(expiresAtMs),
      reason: stale ? 'SIGNAL_EXPIRED' : 'SIGNAL_FRESH',
    };
  }

  public validateTransition(
    currentState: SignalReviewState,
    action: SignalReviewAction,
    freshness: SignalFreshnessDecision,
  ): SignalReviewState {
    if (freshness.stale) throw new Error('STALE_SIGNAL_REVIEW_BLOCKED');
    if (currentState === 'EXPIRED') throw new Error('EXPIRED_SIGNAL_REVIEW_BLOCKED');
    if (currentState !== 'PENDING') throw new Error('SIGNAL_ALREADY_REVIEWED');
    return action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  }
}

export function buildReviewFingerprint(request: SignalReviewRequest): string {
  const parsed = signalReviewRequestSchema.parse(request);
  return createHash('sha256')
    .update([
      parsed.signalCandidateKey,
      parsed.action,
      parsed.idempotencyKey,
      parsed.reviewer,
      parsed.reason,
      parsed.observedLastSeenAt,
    ].join('|'))
    .digest('hex');
}
