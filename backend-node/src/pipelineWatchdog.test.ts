import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineWatchdog } from './pipelineWatchdog.js';
import {
  registerSignalScannerWorker,
  SignalScannerWorker,
} from './signalScannerWorker.js';

const NOW = Date.parse('2026-08-04T00:00:00.000Z');

function scanResult(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-08-04T00:00:00.000Z',
    durationMs: 200,
    pipelineCounts: {
      universe: 50,
      oneHour: 20,
      fifteenMinute: 10,
      fiveMinute: 3,
      finalCandidates: 2,
    },
    persistence: {
      insertedCount: 2,
      duplicateSuppressedCount: 0,
      totalStored: 2,
    },
    signalPersistenceEnabled: true as const,
    actionable: false as const,
    executionEnabled: false as const,
    ...overrides,
  };
}

function signalWorker(
  runner: { scanAndPersist: () => Promise<ReturnType<typeof scanResult>> },
) {
  const worker = new SignalScannerWorker({
    enabled: true,
    intervalMs: 15 * 60_000,
    initialDelayMs: 30_000,
    runTimeoutMs: 13 * 60_000,
    runner,
    now: () => NOW,
  });
  registerSignalScannerWorker(worker);
  return worker;
}

function createWatchdog(options: {
  demoConnected?: boolean;
  marketData?: { assertClockSafe: () => Promise<{ skewMs: number }> };
} = {}) {
  const demoConnected = options.demoConnected ?? true;
  return new PipelineWatchdog({
    enabled: true,
    intervalMs: 15 * 60_000,
    initialDelayMs: 90_000,
    runTimeoutMs: 60_000,
    pipeline: { scanTopUniverseFiveMinute: async () => ({}) },
    marketData: options.marketData ?? { assertClockSafe: async () => ({ skewMs: 12 }) },
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
    now: () => NOW,
  });
}

test('reports healthy while supervising a successful persistence worker', async () => {
  const worker = signalWorker({ scanAndPersist: async () => scanResult() });
  await worker.runNow('TEST');

  const watchdog = createWatchdog();
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
  assert.equal(status.lastRun?.dependencies.signalWorker, true);
  assert.equal(status.signalPersistenceEnabled, false);
  assert.equal(status.supervisedSignalPersistenceEnabled, true);
  assert.equal(status.executionEnabled, false);
});

test('reports degraded before the signal worker completes its first cycle', async () => {
  signalWorker({ scanAndPersist: async () => scanResult() });

  const watchdog = createWatchdog();
  await watchdog.runNow('TEST');

  const status = watchdog.getStatus();
  assert.equal(status.state, 'DEGRADED');
  assert.ok(status.lastRun?.issues.includes('SIGNAL_WORKER_NOT_STARTED'));
  assert.equal(status.lastRun?.dependencies.signalWorker, true);
});

test('fails closed when the automated signal worker fails', async () => {
  const worker = signalWorker({
    scanAndPersist: async () => scanResult({
      persistence: {
        insertedCount: 0,
        duplicateSuppressedCount: 0,
        totalStored: 0,
      },
    }),
  });
  await worker.runNow('TEST');

  const watchdog = createWatchdog();
  await watchdog.runNow('TEST');

  const status = watchdog.getStatus();
  assert.equal(status.state, 'FAILED');
  assert.ok(status.lastRun?.issues.includes('SIGNAL_WORKER_FAILED'));
  assert.equal(status.lastRun?.dependencies.signalWorker, false);
});

test('marks worker supervision degraded when Bybit Demo health is unavailable', async () => {
  const worker = signalWorker({ scanAndPersist: async () => scanResult() });
  await worker.runNow('TEST');

  const watchdog = createWatchdog({ demoConnected: false });
  await watchdog.runNow('TEST');

  const status = watchdog.getStatus();
  assert.equal(status.state, 'DEGRADED');
  assert.ok(status.lastRun?.issues.includes('BYBIT_DEMO_UNAVAILABLE'));
});

test('skips an overlapping watchdog run', async () => {
  const worker = signalWorker({ scanAndPersist: async () => scanResult() });
  await worker.runNow('TEST');

  let release!: (value: { skewMs: number }) => void;
  const pending = new Promise<{ skewMs: number }>((resolve) => {
    release = resolve;
  });
  const watchdog = createWatchdog({
    marketData: { assertClockSafe: async () => pending },
  });

  const first = watchdog.runNow('TEST');
  await new Promise((resolve) => setImmediate(resolve));
  await watchdog.runNow('TEST');
  assert.equal(watchdog.getStatus().skippedOverlaps, 1);

  release({ skewMs: 12 });
  await first;
  const status = watchdog.getStatus();
  assert.equal(status.state, 'DEGRADED');
  assert.ok(status.lastRun?.issues.includes('PREVIOUS_WATCHDOG_RUN_STILL_ACTIVE'));
});
