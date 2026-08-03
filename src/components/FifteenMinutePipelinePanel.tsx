import React from 'react';
import { AlertCircle, CheckCircle2, Filter, RefreshCw } from 'lucide-react';

interface FifteenMinutePipelinePanelProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

type Direction = 'LONG' | 'SHORT';

interface FifteenMinuteSelected {
  setupRank: number;
  oneHourRank: number;
  universeRank: number;
  symbol: string;
  direction: Direction;
  trendStrengthBps: number;
  latestClose: number;
  rsi14: number;
  breakoutLevel: number | null;
  breakoutCandleCloseTimeMs: number | null;
  retestCandleCloseTimeMs: number;
  breakoutAgeCandles: number | null;
  reasons: string[];
  actionable: false;
}

interface FifteenMinuteBatchResponse {
  source: 'bybit-v5-public';
  scanner: 'tradebot-python';
  pipelineStage: 'TOP_50_TO_ONE_HOUR_20_TO_FIFTEEN_MINUTE_10';
  generatedAt: string;
  durationMs: number;
  limits: {
    universe: 50;
    oneHourQualified: 20;
    fifteenMinuteSetups: 10;
    oneHourConcurrency: number;
    fifteenMinuteConcurrency: number;
  };
  universe: {
    tradingSymbolCount: number;
    selectedCount: number;
    maxSpreadBps: number;
  };
  oneHour: {
    scannedCount: number;
    qualifiedCount: number;
    selectedCount: number;
    failedCount: number;
  };
  fifteenMinute: {
    requestedCount: number;
    scannedCount: number;
    qualifiedCount: number;
    selectedCount: number;
    rejectedCount: number;
    failedCount: number;
    selected: FifteenMinuteSelected[];
    rejected: Array<{
      oneHourRank: number;
      symbol: string;
      direction: Direction;
      rsi14: number;
      breakoutLevel: number | null;
      breakoutAgeCandles: number | null;
      reasons: string[];
    }>;
    failures: Array<{
      oneHourRank: number;
      symbol: string;
      direction: Direction;
      code: string;
    }>;
  };
  setupFreshnessRule: 'LATEST_CLOSED_15M_CANDLE_MUST_BE_THE_RETEST';
  nextStage: 'FIVE_MINUTE_ENTRY_PENDING';
  actionable: false;
  executionEnabled: false;
}

const PIPELINE_TIMEOUT_MS = 180000;

async function requestPipeline(url: string): Promise<FifteenMinuteBatchResponse> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(PIPELINE_TIMEOUT_MS),
  });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`NON_JSON_RESPONSE_HTTP_${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as
    | FifteenMinuteBatchResponse
    | { error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    throw new Error(errorBody?.error?.code || errorBody?.error?.message || `HTTP_${response.status}`);
  }
  if (!body) throw new Error('INVALID_JSON_RESPONSE');
  return body as FifteenMinuteBatchResponse;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatTime(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Date(value).toLocaleString();
}

function directionClass(direction: Direction) {
  return direction === 'LONG'
    ? 'bg-emerald-500/10 text-emerald-400'
    : 'bg-rose-500/10 text-rose-400';
}

export default function FifteenMinutePipelinePanel({
  apiBaseUrl,
  onTriggerNoBackendWarning,
}: FifteenMinutePipelinePanelProps) {
  const [result, setResult] = React.useState<FifteenMinuteBatchResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const runPipeline = async () => {
    if (!apiBaseUrl) {
      onTriggerNoBackendWarning('VITE_API_BASE_URL is not configured');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setResult(await requestPipeline(`${apiBaseUrl}/api/scanner/batch/fifteen-minute`));
    } catch (scanError) {
      setResult(null);
      setError(scanError instanceof Error ? scanError.message : 'FIFTEEN_MINUTE_PIPELINE_FAILED');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-brand-bybit/30 bg-card-bg p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-trading-border/70 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Filter className="h-4 w-4 text-brand-bybit" /> Pipeline Stage: 50 → max 20 → max 10
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Top-50 liquidity universe → strict 1H EMA direction → 15M breakout and delayed retest confirmation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-trading-border bg-dark-bg px-2.5 py-1 font-mono text-[10px] text-amber-300">
            5M ENTRY: PENDING
          </span>
          <button
            type="button"
            onClick={() => void runPipeline()}
            disabled={loading || !apiBaseUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-bybit px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Filter className="h-3.5 w-3.5" />}
            {loading ? 'Running 50 → 20 → 10…' : 'Run 50 → 20 → 10'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          15M pipeline failed: <span className="font-mono">{error}</span>. No setup was promoted.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Top Universe', result?.universe.selectedCount ?? 0],
          ['1H Selected', result?.oneHour.selectedCount ?? 0],
          ['15M Scanned', result?.fifteenMinute.scannedCount ?? 0],
          ['15M Qualified', result?.fifteenMinute.qualifiedCount ?? 0],
          ['Selected Max 10', result?.fifteenMinute.selectedCount ?? 0],
          ['15M Failed', result?.fifteenMinute.failedCount ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
            <p className="mt-2 font-mono text-xl font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {!result && !loading && !error && (
        <div className="mt-4 rounded-lg border border-dashed border-trading-border p-8 text-center text-xs text-slate-500">
          Run the pipeline to evaluate live closed candles. Fewer than 10 results are valid and expected when market conditions are weak.
        </div>
      )}

      {loading && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-trading-border bg-dark-bg/40 py-10 text-xs text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Scanning 50 symbols on 1H, then checking up to 20 symbols on 15M…
        </div>
      )}

      {result && !loading && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Completed in {formatNumber(result.durationMs / 1000, 1)} sec · Latest closed 15M candle must be the retest
            </span>
            <span>{new Date(result.generatedAt).toLocaleString()}</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-trading-border">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-dark-bg/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Symbol</th>
                  <th className="px-3 py-3">Direction</th>
                  <th className="px-3 py-3 text-right">1H Rank</th>
                  <th className="px-3 py-3 text-right">Breakout Level</th>
                  <th className="px-3 py-3 text-right">Breakout Age</th>
                  <th className="px-3 py-3 text-right">RSI14</th>
                  <th className="px-3 py-3">Retest Closed</th>
                  <th className="px-3 py-3">Next</th>
                </tr>
              </thead>
              <tbody>
                {result.fifteenMinute.selected.map((item) => (
                  <tr key={item.symbol} className="border-t border-trading-border/70 text-slate-300">
                    <td className="px-3 py-3 font-mono text-slate-500">{item.setupRank}</td>
                    <td className="px-3 py-3 font-mono font-bold text-slate-100">
                      {item.symbol}
                      <span className="ml-2 text-[10px] font-normal text-slate-600">U#{item.universeRank}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded px-2 py-1 font-mono text-[10px] font-bold ${directionClass(item.direction)}`}>
                        {item.direction}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{item.oneHourRank}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatNumber(item.breakoutLevel, 6)}</td>
                    <td className="px-3 py-3 text-right font-mono">{item.breakoutAgeCandles ?? '—'} candle</td>
                    <td className="px-3 py-3 text-right font-mono">{formatNumber(item.rsi14, 2)}</td>
                    <td className="px-3 py-3 text-[11px]">{formatTime(item.retestCandleCloseTimeMs)}</td>
                    <td className="px-3 py-3 text-[10px] font-semibold text-amber-300">5M PENDING</td>
                  </tr>
                ))}
                {result.fifteenMinute.selected.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                      No current 15M breakout-retest setup passed. The scanner did not fill the quota artificially.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {result.fifteenMinute.selected.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
              <div className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{result.fifteenMinute.selected.length} setup(s) passed and may proceed to the future 5M confirmation stage. No signal or order was created.</p>
              </div>
            </div>
          )}

          {result.fifteenMinute.failures.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">15M failures</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.fifteenMinute.failures.map((failure) => (
                  <span key={`${failure.symbol}-${failure.code}`} className="rounded border border-amber-500/20 px-2 py-1 font-mono text-[10px] text-amber-200">
                    {failure.symbol}: {failure.code}
                  </span>
                ))}
              </div>
            </div>
          )}

          <details className="rounded-lg border border-trading-border bg-dark-bg/40 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-300">
              Rejected 15M setups ({result.fifteenMinute.rejectedCount})
            </summary>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {result.fifteenMinute.rejected.map((item) => (
                <div key={item.symbol} className="rounded border border-trading-border bg-card-bg p-2.5 text-[10px] text-slate-400">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-200">{item.symbol}</span>
                    <span className={directionClass(item.direction)}>{item.direction}</span>
                  </div>
                  <p className="mt-2 font-mono">{item.reasons.join(' · ')}</p>
                </div>
              ))}
              {result.fifteenMinute.rejected.length === 0 && (
                <p className="text-xs text-slate-500">No rejected setup.</p>
              )}
            </div>
          </details>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
        <div className="flex gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Analysis only. Closed candles are mandatory; 5M entry, risk validation, signals and execution remain disabled.</p>
        </div>
      </div>
    </section>
  );
}
