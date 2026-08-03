import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineWatchdog } from './pipelineWatchdog.js';

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: new Date('2026-08-04T00:00:00.000Z').toISOString(),
    durationMs: 100,
    universe: { selectedCount: 50 },
    oneHour: { selectedCount: 20, failedCount: 0 },
    fifteenMinute: { selectedCount: 10, failedCount: 0 },
    fiveMinute: { selectedCount: 3, failedCount: 0, duplicateCount: 0 },
    finalCandidates: { selectedCount: 2, failedCount: 0, duplicateCount: 0 },
    signalGenerationEnabled: false as const,
    actionable: false as const,
    executionEnabled: false as const,
    ...overrides,
  };
}

function createWatchdog(
  pipeline: { scanTopUniverseFiveMinute: () => Promise<ReturnType<typeof snapshot>> },
  demoConnected = true,
) {
  return new PipelineWatchdog({
    enabled: true,
    intervalMs: 15 * 60_000,
    initialDelayMs: 30_000,
    runTimeoutMs: 5_000,
    pipeline,
    marketData: { assertClockSafe: async () => ({ skewMs: 12 }) },
    getPythonReadiness: async () => ({
      ready: true,
      reason: null,
      attempts: 1,
      upstreamStatus: 200,
    }),
    getDemoHealth: async () => ({
      connected: demoConnected,
      reason: demoConnected ? null : 'BYBIT_DEMO_NOT_CONFIGURED',
    }),
    now: () => Date.parse('2026-08-04T00:00:00.000Z'),
  });
}

test('reports healthy for a valid 50-20-10-3 pipeline snapshot', async () => {
  const watchdog = createWatchdog({ scanTopUniverseFiveMinute: async () => snapshot() });
  await watchdog.runNow('TEST');

  const status = watchdog.getStatus();
  assert.equal(status.state, 'HEALTHY');
  assert.deepEqual(status.lastRun?.counts, {
    universe: 50,
    oneHour: 20,
    fifteenMinute: 10,
    fiveMinute: 3,
    finalCandidates: 2,
  });
  assert.equal(status.signalPersistenceEnabled, false);
  assert.equal(status.executionEnabled, false);
});

test('fails closed when a pipeline stage exceeds its locked limit', async () => {
  const watchdog = createWatchdog({
    scanTopUniverseFiveMinute: async () => snapshot({
      oneHour: { selectedCount: 21, failedCount: 0 },
    }),
  });
  await watchdog.runNow('TEST');

  const status = watchdog.getStatus();
  assert.equal(status.state, 'FAILED');
  assert.ok(status.lastRun?.issues.includes('PIPELINE_LIMIT_VIOLATION'));
});

test('marks a successful scan degraded when Bybit Demo health is unavailable', async () => {
  const watchdog = createWatchdog({ scanTopUniverseFiveMinute: async () => snapshot() }, false);
  await watchdog.runNow('TEST');

  const status = watchdog.getStatus();
  assert.equal(status.state, 'DEGRADED');
  assert.ok(status.lastRun?.issues.includes('BYBIT_DEMO_UNAVAILABLE'));
});

test('skips an overlapping watchdog run and reports degradation', async () => {
  let release!: (value: ReturnType<typeof snapshot>) => void;
  const pending = new Promise<ReturnType<typeof snapshot>>((resolve) => {
    release = resolve;
  });
  const watchdog = createWatchdog({ scanTopUniverseFiveMinute: async () => pending });

  const first = watchdog.runNow('TEST');
  await new Promise((resolve) => setImmediate(resolve));
  await watchdog.runNow('TEST');

  assert.equal(watchdog.getStatus().skippedOverlaps, 1);
  release(snapshot());
  await first;
  const status = watchdog.getStatus();
  assert.equal(status.state, 'DEGRADED');
  assert.ok(status.lastRun?.issues.includes('PREVIOUS_WATCHDOG_RUN_STILL_ACTIVE'));
});
