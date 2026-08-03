import assert from 'node:assert/strict';
import test from 'node:test';
import { SignalScannerWorker } from './signalScannerWorker.js';

const NOW = Date.parse('2026-08-04T00:00:00.000Z');

function result(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-08-04T00:00:00.000Z',
    durationMs: 250,
    pipelineCounts: {
      universe: 50,
      oneHour: 16,
      fifteenMinute: 2,
      fiveMinute: 1,
      finalCandidates: 1,
    },
    persistence: {
      insertedCount: 1,
      duplicateSuppressedCount: 0,
      totalStored: 1,
    },
    signalPersistenceEnabled: true as const,
    actionable: false as const,
    executionEnabled: false as const,
    ...overrides,
  };
}

function createWorker(
  runner: { scanAndPersist: () => Promise<ReturnType<typeof result>> },
) {
  return new SignalScannerWorker({
    enabled: true,
    intervalMs: 15 * 60_000,
    initialDelayMs: 30_000,
    runTimeoutMs: 13 * 60_000,
    runner,
    now: () => NOW,
  });
}

test('persists a valid final candidate and reports healthy', async () => {
  const worker = createWorker({ scanAndPersist: async () => result() });
  await worker.runNow('TEST');

  const status = worker.getStatus();
  assert.equal(status.state, 'HEALTHY');
  assert.equal(status.lastRun?.persistence?.insertedCount, 1);
  assert.equal(status.lastRun?.pipelineCounts?.finalCandidates, 1);
  assert.equal(status.signalPersistenceEnabled, true);
  assert.equal(status.executionEnabled, false);
});

test('accepts a valid zero-candidate cycle as healthy', async () => {
  const worker = createWorker({
    scanAndPersist: async () => result({
      pipelineCounts: {
        universe: 50,
        oneHour: 16,
        fifteenMinute: 0,
        fiveMinute: 0,
        finalCandidates: 0,
      },
      persistence: {
        insertedCount: 0,
        duplicateSuppressedCount: 0,
        totalStored: 0,
      },
    }),
  });
  await worker.runNow('TEST');

  assert.equal(worker.getStatus().state, 'HEALTHY');
});

test('accepts an atomic duplicate update when persistence count matches candidates', async () => {
  const worker = createWorker({
    scanAndPersist: async () => result({
      persistence: {
        insertedCount: 0,
        duplicateSuppressedCount: 1,
        totalStored: 1,
      },
    }),
  });
  await worker.runNow('TEST');

  const status = worker.getStatus();
  assert.equal(status.state, 'HEALTHY');
  assert.equal(status.lastRun?.persistence?.duplicateSuppressedCount, 1);
});

test('fails closed when final-candidate and persistence counts do not match', async () => {
  const worker = createWorker({
    scanAndPersist: async () => result({
      persistence: {
        insertedCount: 0,
        duplicateSuppressedCount: 0,
        totalStored: 0,
      },
    }),
  });
  await worker.runNow('TEST');

  const status = worker.getStatus();
  assert.equal(status.state, 'FAILED');
  assert.ok(status.lastRun?.issues.includes('SIGNAL_WORKER_PERSISTENCE_COUNT_MISMATCH'));
});

test('blocks overlapping scheduled work', async () => {
  let release!: (value: ReturnType<typeof result>) => void;
  const pending = new Promise<ReturnType<typeof result>>((resolve) => {
    release = resolve;
  });
  const worker = createWorker({ scanAndPersist: async () => pending });

  const first = worker.runNow('TEST');
  await new Promise((resolve) => setImmediate(resolve));
  await worker.runNow('TEST');
  assert.equal(worker.getStatus().skippedOverlaps, 1);

  release(result());
  await first;
  const status = worker.getStatus();
  assert.equal(status.state, 'FAILED');
  assert.ok(status.lastRun?.issues.includes('PREVIOUS_SIGNAL_WORKER_RUN_STILL_ACTIVE'));
});
