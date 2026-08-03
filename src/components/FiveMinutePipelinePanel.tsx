import React from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, ShieldCheck, Zap } from 'lucide-react';

interface FiveMinutePipelinePanelProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

type Direction = 'LONG' | 'SHORT';

interface SelectedEntry {
  entryRank: number;
  setupRank: number;
  oneHourRank: number;
  universeRank: number;
  symbol: string;
  direction: Direction;
  trendStrengthBps: number;
  rsi14: number;
  breakoutLevel: number | null;
  retestCandleCloseTimeMs: number;
  latestClose: number;
  sweepLevel: number;
  averageVolume20: number;
  latestVolume: number;
  volumeRatio: number;
  sweepDepthBps: number;
  entryCandleCloseTimeMs: number;
  entryKey: string;
  reasons: string[];
  actionable: false;
}

interface FiveMinutePipelineResponse {
  source: string;
  scanner: string;
  pipelineStage: 'TOP_50_TO_ONE_HOUR_20_TO_FIFTEEN_MINUTE_10_TO_FIVE_MINUTE_3';
  generatedAt: string;
  durationMs: number;
  limits: {
    universe: number;
    oneHourQualified: number;
    fifteenMinuteSetups: number;
    fiveMinuteEntries: 3;
    fiveMinuteConcurrency: number;
  };
  universe: {
    selectedCount: number;
    tradingSymbolCount: number;
  };
  oneHour: {
    selectedCount: number;
    failedCount: number;
  };
  fifteenMinute: {
    selectedCount: number;
    failedCount: number;
  };
  fiveMinute: {
    requestedCount: number;
    scannedCount: number;
    qualifiedCount: number;
    uniqueQualifiedCount: number;
    selectedCount: number;
    rejectedCount: number;
    duplicateCount: number;
    failedCount: number;
    selected: SelectedEntry[];
    rejected: Array<{
      setupRank: number;
      symbol: string;
      direction: Direction;
      volumeRatio: number;
      sweepDepthBps: number;
      entryKey: string;
      reasons: string[];
    }>;
    duplicates: Array<{
      setupRank: number;
      symbol: string;
      direction: Direction;
      entryKey: string;
      reason: string;
    }>;
    failures: Array<{
      setupRank: number;
      symbol: string;
      direction: Direction;
      code: string;
    }>;
  };
  entryFreshnessRule: string;
  duplicatePolicy: string;
  nextStage: 'RISK_VALIDATION_PENDING';
  actionable: false;
  executionEnabled: false;
}

const REQUEST_TIMEOUT_MS = 180000;

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`NON_JSON_RESPONSE_HTTP_${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as
    | T
    | { error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    throw new Error(errorBody?.error?.code || errorBody?.error?.message || `HTTP_${response.status}`);
  }
  if (body === null) throw new Error('INVALID_JSON_RESPONSE');
  return body as T;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function directionClass(direction: Direction) {
  return direction === 'LONG'
    ? 'bg-emerald-500/10 text-emerald-400'
    : 'bg-rose-500/10 text-rose-400';
}

export default function FiveMinutePipelinePanel({
  apiBaseUrl,
  onTriggerNoBackendWarning,
}: FiveMinutePipelinePanelProps) {
  const [result, setResult] = React.useState<FiveMinutePipelineResponse | null>(null);
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
      const response = await requestJson<FiveMinutePipelineResponse>(
        `${apiBaseUrl}/api/scanner/batch/five-minute`,
      );
      setResult(response);
    } catch (pipelineError) {
      setResult(null);
      setError(pipelineError instanceof Error ? pipelineError.message : 'FIVE_MINUTE_PIPELINE_FAILED');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-cyan-500/20 bg-card-bg p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-trading-border/70 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Zap className="h-4 w-4 text-cyan-400" /> Full Scanner Pipeline: 50 → 20 → 10 → Maximum 3
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Latest closed 5M candle must sweep the previous 20-candle level, reclaim/reject it, and exceed 1.5× average volume.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 font-mono text-[10px] text-amber-300">
            RISK VALIDATION: PENDING
          </span>
          <button
            type="button"
            onClick={() => void runPipeline()}
            disabled={loading || !apiBaseUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Running Full Pipeline…' : 'Run 50 → 20 → 10 → 3'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          Pipeline unavailable: <span className="font-mono">{error}</span>. No entry candidate was fabricated.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ['Top Universe', result?.universe.selectedCount ?? 0],
          ['1H Selected', result?.oneHour.selectedCount ?? 0],
          ['15M Selected', result?.fifteenMinute.selectedCount ?? 0],
          ['5M Scanned', result?.fiveMinute.scannedCount ?? 0],
          ['Entry Max 3', result?.fiveMinute.selectedCount ?? 0],
          ['Failed', result?.fiveMinute.failedCount ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
            <p className="mt-2 font-mono text-xl font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {!result && !loading && !error && (
        <div className="mt-4 rounded-lg border border-dashed border-trading-border p-8 text-center text-xs text-slate-500">
          Run the complete pipeline to produce up to three strict 5M entry candidates. Zero candidates is a valid result.
        </div>
      )}

      {loading && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-trading-border bg-dark-bg/40 py-10 text-xs text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Running live 1H, 15M and 5M closed-candle analysis…
        </div>
      )}

      {result && !loading && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Completed in {formatNumber(result.durationMs / 1000, 1)} sec · Qualified {result.fiveMinute.qualifiedCount} · Duplicates blocked {result.fiveMinute.duplicateCount}
            </span>
            <span>{new Date(result.generatedAt).toLocaleString()}</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-trading-border">
            <table className="w-full min-w-[1050px] text-left text-xs">
              <thead className="bg-dark-bg/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Symbol</th>
                  <th className="px-3 py-3">Direction</th>
                  <th className="px-3 py-3 text-right">Volume Ratio</th>
                  <th className="px-3 py-3 text-right">Sweep Depth</th>
                  <th className="px-3 py-3 text-right">Sweep Level</th>
                  <th className="px-3 py-3 text-right">Close</th>
                  <th className="px-3 py-3">Entry Candle</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.fiveMinute.selected.map((entry) => (
                  <tr key={entry.entryKey} className="border-t border-trading-border/70 text-slate-300">
                    <td className="px-3 py-3 font-mono text-slate-500">{entry.entryRank}</td>
                    <td className="px-3 py-3">
                      <span className="font-mono font-bold text-slate-100">{entry.symbol}</span>
                      <span className="ml-2 text-[10px] text-slate-600">S#{entry.setupRank}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded px-2 py-1 font-mono text-[10px] font-bold ${directionClass(entry.direction)}`}>
                        {entry.direction}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{formatNumber(entry.volumeRatio, 2)}×</td>
                    <td className="px-3 py-3 text-right font-mono">{formatNumber(entry.sweepDepthBps, 2)} bps</td>
                    <td className="px-3 py-3 text-right font-mono">{formatNumber(entry.sweepLevel, 6)}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatNumber(entry.latestClose, 6)}</td>
                    <td className="px-3 py-3 text-[10px] text-slate-400">
                      {new Date(entry.entryCandleCloseTimeMs).toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> ENTRY PASSED
                      </span>
                    </td>
                  </tr>
                ))}
                {result.fiveMinute.selected.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                      No latest 5M candle passed sweep, reclaim/rejection and volume rules. The max-three quota was not filled artificially.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {result.fiveMinute.selected.map((entry) => (
            <div key={`${entry.entryKey}-reasons`} className="rounded-lg border border-trading-border bg-dark-bg/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-slate-200">{entry.symbol} · {entry.entryKey}</span>
                <span className="text-[10px] text-slate-500">Latest volume {formatNumber(entry.latestVolume, 2)} / Avg20 {formatNumber(entry.averageVolume20, 2)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {entry.reasons.map((reason) => (
                  <span key={reason} className="rounded border border-trading-border px-2 py-1 font-mono text-[10px] text-slate-300">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {(result.fiveMinute.rejected.length > 0 || result.fiveMinute.failures.length > 0) && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" /> Rejected and failed 5M checks
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.fiveMinute.rejected.map((entry) => (
                  <span key={entry.entryKey} className="rounded border border-amber-500/20 px-2 py-1 font-mono text-[10px] text-amber-200">
                    {entry.symbol}: {entry.reasons.join(', ')}
                  </span>
                ))}
                {result.fiveMinute.failures.map((failure) => (
                  <span key={`${failure.symbol}-${failure.code}`} className="rounded border border-rose-500/20 px-2 py-1 font-mono text-[10px] text-rose-300">
                    {failure.symbol}: {failure.code}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Analysis only. Entry keys prevent duplicate symbol-direction-candle results inside a scan. Persistent signal deduplication, risk validation and execution remain disabled.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
