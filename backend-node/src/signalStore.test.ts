import assert from 'node:assert/strict';
import test from 'node:test';
import { SignalStore, type SignalCandidateInput } from './signalStore.js';

function candidate(key = 'BTCUSDT:LONG:1000:900'): SignalCandidateInput {
  return {
    signalCandidateKey: key,
    symbol: key.startsWith('ETH') ? 'ETHUSDT' : 'BTCUSDT',
    direction: key.includes(':SHORT:') ? 'SHORT' : 'LONG',
    entryPrice: 100,
    stopLoss: key.includes(':SHORT:') ? 102 : 98,
    targetPrice: key.includes(':SHORT:') ? 96 : 104,
    riskDistance: 2,
    riskRewardRatio: 2,
    riskBps: 200,
    swingPrice: key.includes(':SHORT:') ? 102 : 98,
    swingAgeCandles: 2,
    entryKey: key.split(':').slice(0, 3).join(':'),
    volumeRatio: 1.8,
    sweepDepthBps: 25,
    entryCandleCloseTimeMs: 1000,
    swingCandleCloseTimeMs: 900,
    reasons: ['VALID_FINAL_RISK_CANDIDATE'],
    candidateRank: 1,
  };
}

type DatabaseRow = Record<string, unknown> & {
  signal_candidate_key: string;
  seen_count: number;
  first_seen_at: string;
  last_seen_at: string;
};

function jsonResponse(payload: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function createSupabaseMock() {
  const rows = new Map<string, DatabaseRow>();

  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);

    if (url.pathname.endsWith('/rest/v1/rpc/upsert_trade_signal')) {
      const body = JSON.parse(String(init.body)) as {
        p_signal: Record<string, unknown> & { signal_candidate_key: string };
        p_observed_at: string;
      };
      const current = rows.get(body.p_signal.signal_candidate_key);
      const inserted = current === undefined;
      const row: DatabaseRow = current
        ? {
            ...current,
            evidence: body.p_signal.evidence,
            seen_count: current.seen_count + 1,
            last_seen_at: body.p_observed_at,
            updated_at: body.p_observed_at,
          }
        : {
            id: '00000000-0000-4000-8000-000000000001',
            ...body.p_signal,
            seen_count: 1,
            first_seen_at: body.p_observed_at,
            last_seen_at: body.p_observed_at,
            actionable: false,
            execution_enabled: false,
            created_at: body.p_observed_at,
            updated_at: body.p_observed_at,
          };
      rows.set(body.p_signal.signal_candidate_key, row);
      return jsonResponse([{ inserted, signal: row }]);
    }

    if (url.pathname.endsWith('/rest/v1/trade_signals')) {
      if (url.searchParams.get('select') === 'id') {
        const range = rows.size === 0 ? '*/0' : `0-0/${rows.size}`;
        return jsonResponse([...rows.values()].slice(0, 1).map((row) => ({ id: row.id })), {
          'content-range': range,
        });
      }

      const limit = Number(url.searchParams.get('limit') ?? 100);
      const listed = [...rows.values()]
        .sort((left, right) => right.last_seen_at.localeCompare(left.last_seen_at))
        .slice(0, limit);
      return jsonResponse(listed);
    }

    return new Response(JSON.stringify({ message: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  return { fetchImpl, rows };
}

function createStore(fetchImpl: typeof fetch) {
  return new SignalStore({
    supabaseUrl: 'https://example.supabase.co',
    secretKey: 'server-secret-key-that-is-long-enough-123456',
    requestTimeoutMs: 5_000,
    fetchImpl,
  });
}

test('persists signals and suppresses the same candidate across cycles', async () => {
  const mock = createSupabaseMock();
  const firstStore = createStore(mock.fetchImpl);

  const first = await firstStore.upsert([candidate()], '2026-08-03T20:00:00.000Z');
  assert.equal(first.insertedCount, 1);
  assert.equal(first.duplicateSuppressedCount, 0);
  assert.equal(first.totalStored, 1);

  const second = await firstStore.upsert([candidate()], '2026-08-03T20:15:00.000Z');
  assert.equal(second.insertedCount, 0);
  assert.equal(second.duplicateSuppressedCount, 1);
  assert.equal(second.totalStored, 1);

  const reopenedStore = createStore(mock.fetchImpl);
  const persisted = await reopenedStore.list(10);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.seenCount, 2);
  assert.equal(persisted[0]?.createdAt, '2026-08-03T20:00:00.000Z');
  assert.equal(persisted[0]?.lastSeenAt, '2026-08-03T20:15:00.000Z');
  assert.equal(persisted[0]?.executionStatus, 'NOT_EXECUTED');
});

test('inserts different candidate keys independently', async () => {
  const mock = createSupabaseMock();
  const store = createStore(mock.fetchImpl);
  const result = await store.upsert(
    [candidate(), candidate('ETHUSDT:SHORT:2000:1800')],
    '2026-08-03T20:00:00.000Z',
  );

  assert.equal(result.insertedCount, 2);
  assert.equal(result.totalStored, 2);
  assert.equal((await store.list(10)).length, 2);
});

test('suppresses duplicate keys inside one request without a second database mutation', async () => {
  const mock = createSupabaseMock();
  const store = createStore(mock.fetchImpl);
  const result = await store.upsert(
    [candidate(), candidate()],
    '2026-08-03T20:00:00.000Z',
  );

  assert.equal(result.insertedCount, 1);
  assert.equal(result.duplicateSuppressedCount, 1);
  assert.equal(mock.rows.get(candidate().signalCandidateKey)?.seen_count, 1);
});

test('fails closed when Supabase rejects server credentials', async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ message: 'forbidden' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
  const store = createStore(fetchImpl);

  await assert.rejects(() => store.list(10), /SUPABASE_SIGNAL_STORE_AUTH_FAILED/);
  await assert.rejects(() => store.checkReady(), /SUPABASE_SIGNAL_STORE_AUTH_FAILED/);
});
