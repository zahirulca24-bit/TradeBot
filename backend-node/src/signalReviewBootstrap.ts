import type { Router } from 'express';
import { z } from 'zod';
import { createSignalReviewRouter } from './signalReviewRoutes.js';
import { SignalReviewStore } from './signalReviewStore.js';

const signalReviewEnvironmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(32),
  SUPABASE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(20_000).default(8_000),
  SIGNAL_REVIEW_TTL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(900_000),
});

export interface SignalReviewIntegration {
  router: Router;
  ttlMs: number;
  executionEnabled: false;
  actionable: false;
}

export function createSignalReviewIntegration(environment: NodeJS.ProcessEnv): SignalReviewIntegration {
  const parsed = signalReviewEnvironmentSchema.parse(environment);
  const store = new SignalReviewStore({
    supabaseUrl: parsed.SUPABASE_URL,
    secretKey: parsed.SUPABASE_SECRET_KEY,
    requestTimeoutMs: parsed.SUPABASE_REQUEST_TIMEOUT_MS,
    ttlMs: parsed.SIGNAL_REVIEW_TTL_MS,
  });

  return {
    router: createSignalReviewRouter(store),
    ttlMs: parsed.SIGNAL_REVIEW_TTL_MS,
    executionEnabled: false,
    actionable: false,
  };
}
