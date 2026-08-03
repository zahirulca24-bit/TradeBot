import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SignalStore, type SignalCandidateInput } from './signalStore.js';

function candidate(key = 'BTCUSDT:LONG:1000:900'): SignalCandidateInput {
  return {
    signalCandidateKey: key,
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryPrice: 100,
    stopLoss: 98,
    targetPrice: 104,
    riskRewardRatio: 2,
    riskBps: 200,
    volumeRatio: 1.8,
    sweepDepthBps: 25,
    entryCandleCloseTimeMs: 1000,
    swingCandleCloseTimeMs: 900,
    reasons: ['VALID_FINAL_RISK_CANDIDATE'],
    candidateRank: 1,
  };
}

test('persists signals and suppresses the same candidate across cycles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tradebot-signal-store-'));
  const filePath = join(directory, 'signals.json');

  try {
    const firstStore = new SignalStore(filePath);
    const first = await firstStore.upsert([candidate()], '2026-08-03T20:00:00.000Z');
    assert.equal(first.insertedCount, 1);
    assert.equal(first.duplicateSuppressedCount, 0);
    assert.equal(first.totalStored, 1);

    const second = await firstStore.upsert([candidate()], '2026-08-03T20:15:00.000Z');
    assert.equal(second.insertedCount, 0);
    assert.equal(second.duplicateSuppressedCount, 1);
    assert.equal(second.totalStored, 1);

    const reopenedStore = new SignalStore(filePath);
    const persisted = await reopenedStore.list(10);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]?.seenCount, 2);
    assert.equal(persisted[0]?.createdAt, '2026-08-03T20:00:00.000Z');
    assert.equal(persisted[0]?.lastSeenAt, '2026-08-03T20:15:00.000Z');
    assert.equal(persisted[0]?.executionStatus, 'NOT_EXECUTED');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('inserts different candidate keys independently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tradebot-signal-store-'));
  const filePath = join(directory, 'signals.json');

  try {
    const store = new SignalStore(filePath);
    const result = await store.upsert(
      [candidate(), candidate('ETHUSDT:SHORT:2000:1800')],
      '2026-08-03T20:00:00.000Z',
    );
    assert.equal(result.insertedCount, 2);
    assert.equal(result.totalStored, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fails closed when the store document is corrupt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tradebot-signal-store-'));
  const filePath = join(directory, 'signals.json');

  try {
    await writeFile(filePath, '{not-json', 'utf8');
    const store = new SignalStore(filePath);
    await assert.rejects(() => store.list(10), /SIGNAL_STORE_CORRUPT/);
    await assert.rejects(
      () => store.upsert([candidate()], '2026-08-03T20:00:00.000Z'),
      /SIGNAL_STORE_CORRUPT/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
