import { Router } from 'express';
import { z } from 'zod';
import { signalReviewRequestSchema } from './signalReview.js';
import { SignalReviewStore } from './signalReviewStore.js';

const keySchema = z.string().min(1).max(240);

function statusFor(code: string): number {
  if (code === 'SIGNAL_NOT_FOUND') return 404;
  if (code === 'SIGNAL_VERSION_CONFLICT' || code === 'SIGNAL_ALREADY_REVIEWED' || code === 'IDEMPOTENCY_KEY_CONFLICT') return 409;
  if (code === 'STALE_SIGNAL_REVIEW_BLOCKED' || code === 'EXPIRED_SIGNAL_REVIEW_BLOCKED') return 422;
  if (code.startsWith('INVALID_')) return 400;
  return 503;
}

function fail(response: import('express').Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'SIGNAL_REVIEW_FAILURE';
  return response.status(statusFor(code)).json({
    error: {
      code,
      message: 'Signal review request was not completed.',
      actionable: false,
      executionEnabled: false,
    },
  });
}

export function createSignalReviewRouter(store: SignalReviewStore): Router {
  const router = Router();

  router.get('/:signalCandidateKey', async (request, response) => {
    const parsed = keySchema.safeParse(request.params.signalCandidateKey);
    if (!parsed.success) return fail(response, new Error('INVALID_SIGNAL_CANDIDATE_KEY'));
    try {
      return response.status(200).json(await store.detail(parsed.data));
    } catch (error) {
      return fail(response, error);
    }
  });

  router.post('/:signalCandidateKey/review', async (request, response) => {
    const parsed = signalReviewRequestSchema.safeParse({
      ...request.body,
      signalCandidateKey: request.params.signalCandidateKey,
    });
    if (!parsed.success) return fail(response, new Error('INVALID_SIGNAL_REVIEW_REQUEST'));
    try {
      const result = await store.review(parsed.data);
      return response.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      return fail(response, error);
    }
  });

  return router;
}
