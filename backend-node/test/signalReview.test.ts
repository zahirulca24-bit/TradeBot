import assert from 'node:assert/strict';
import test from 'node:test';
import { SignalReviewPolicyEngine, buildReviewFingerprint } from '../src/signalReview.js';

const fixedNow = Date.parse('2026-08-04T14:00:00.000Z');
const engine = new SignalReviewPolicyEngine({ ttlMs: 30 * 60_000, now: () => fixedNow });

test('fresh signal can transition from PENDING to APPROVED', () => {
  const freshness = engine.evaluateFreshness({
    signalCandidateKey: 'BTCUSDT:LONG:1',
    lastSeenAt: '2026-08-04T13:45:00.000Z',
    entryCandleCloseTimeMs: Date.parse('2026-08-04T13:45:00.000Z'),
  });
  assert.equal(freshness.stale, false);
  assert.equal(engine.validateTransition('PENDING', 'APPROVE', freshness), 'APPROVED');
});

test('expired signal is blocked before approval', () => {
  const freshness = engine.evaluateFreshness({
    signalCandidateKey: 'ETHUSDT:SHORT:1',
    lastSeenAt: '2026-08-04T12:00:00.000Z',
    entryCandleCloseTimeMs: Date.parse('2026-08-04T12:00:00.000Z'),
  });
  assert.equal(freshness.stale, true);
  assert.throws(() => engine.validateTransition('PENDING', 'APPROVE', freshness), /STALE_SIGNAL_REVIEW_BLOCKED/);
});

test('already reviewed signal cannot transition again', () => {
  const freshness = engine.evaluateFreshness({
    signalCandidateKey: 'SOLUSDT:LONG:1',
    lastSeenAt: '2026-08-04T13:55:00.000Z',
    entryCandleCloseTimeMs: Date.parse('2026-08-04T13:55:00.000Z'),
  });
  assert.throws(() => engine.validateTransition('APPROVED', 'REJECT', freshness), /SIGNAL_ALREADY_REVIEWED/);
});

test('same review request produces deterministic fingerprint', () => {
  const request = {
    signalCandidateKey: 'BTCUSDT:LONG:1',
    action: 'APPROVE' as const,
    idempotencyKey: 'review-20260804-btc-long-0001',
    reviewer: 'operator',
    reason: 'Closed-candle evidence reviewed',
    observedLastSeenAt: '2026-08-04T13:45:00.000Z',
  };
  assert.equal(buildReviewFingerprint(request), buildReviewFingerprint(request));
});
