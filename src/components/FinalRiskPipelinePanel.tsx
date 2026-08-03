import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Target,
} from 'lucide-react';

interface FinalRiskPipelinePanelProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

type Direction = 'LONG' | 'SHORT';

interface FinalCandidate {
  candidateRank: number;
  entryRank: number;
  setupRank: number;
  oneHourRank: number;
  universeRank: number;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  stopLoss: number | null;
  targetPrice: number | null;
  riskDistance: number | null;
  riskBps: number | null;
  riskRewardRatio: number | null;
  swingPrice: number | null;
  swingCandleCloseTimeMs: number | null;
  swingAgeCandles: number | null;
  entryCandleCloseTimeMs: number;
  entryKey: string;
  signalCandidateKey: string | null;
  volumeRatio: number;
  sweepDepthBps: number;
  reasons: string[];
  signalCandidate: true;
  actionable: false;
}

interface FinalRiskResponse {
  pipelineStage: 'TOP_50_TO_20_TO_10_TO_3_TO_FINAL_RISK_CANDIDATES';
  generatedAt: string;
  durationMs: number;
  limits: {
    universe: number;
    oneHourQualified: number;
    fifteenMinuteSetups: number;
    fiveMinuteEntries: number;
    finalCandidates: number;
    riskConcurrency: number;
  };
  universe: { selectedCount: number };
  oneHour: { selectedCount: number };
  fifteenMinute: { selectedCount: number };
  fiveMinute: { selectedCount: number };
  finalCandidates: {
    requestedCount: number;
    scannedCount: number;
    qualifiedCount: number;
    uniqueQualifiedCount: number;
    selectedCount: number;
    rejectedCount: number;
    duplicateCount: number;
    failedCount: number;
    selected: FinalCandidate[];
    rejected: Array<{
      entryRank: number;
      symbol: string;
      direction: Direction;
      entryPrice: number;
      stopLoss: number | null;
      swingPrice: number | null;
      swingCandleCloseTimeMs: number | null;
      reasons: string[];
    }>;
    failures: Array<{
      entryRank: number;
      symbol: string;
      direction: Direction;
      entryKey: string;
      code: string;
    }>;
  };
  riskPolicy: string;
  nextStage: string;
  signalGenerationEnabled: false;
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

function formatNumber(value: number | null | undefined, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatTimestamp(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Date(value).toLocaleString();
}

function directionClass(direction: Direction) {
  return direction === 'LONG'
    ? 'bg-emerald-500/10 text-emerald-400'
    : 'bg-rose-500/10 text-rose-400';
}

export default function FinalRiskPipelinePanel({
  apiBaseUrl,
  onTriggerNoBackendWarning,
}: FinalRiskPipelinePanelProps) {
  const [result, setResult] = React.useState<FinalRiskResponse | null>(null);
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
      const response = await requestJson<FinalRiskResponse>(
        `${apiBaseUrl}/api/scanner/batch/five-minute`,
      );
      setResult(response);
    } catch (pipelineError) {
      setResult(null);
      setError(
        pipelineError instanceof Error
          ? pipelineError.message
          : 'FINAL_RISK_PIPELINE_FAILED',
      );
    } finally {
      setLoading(false);
    }
  };

  const blockedCount = result
    ? result.finalCandidates.rejectedCount + result.finalCandidates.failedCount
    : 0;

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-card-bg p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-trading-border/70 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Final Risk Validation
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Full closed-candle pipeline: 50 → max 20 → max 10 → max 3 → confirmed 15M swing SL and minimum R:R 1:2.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 font-mono text-[10px] text-amber-300">
            CANDIDATE ONLY · EXECUTION OFF
          </span>
          <button
            type="button"
            onClick={() => void runPipeline()}
            disabled={loading || !apiBaseUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Target className="h-3.5 w-3.5" />
            )}
            {loading ? 'Validating Full Pipeline…' : 'Run Final Candidate Scan'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          Final risk pipeline failed: <span className="font-mono">{error}</span>. No candidate was fabricated.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Top Universe', result?.universe.selectedCount ?? 0],
          ['1H Selected', result?.oneHour.selectedCount ?? 0],
          ['15M Setups', result?.fifteenMinute.selectedCount ?? 0],
          ['5M Entries', result?.fiveMinute.selectedCount ?? 0],
          ['Final Candidates', result?.finalCandidates.selectedCount ?? 0],
          ['Risk Blocked', blockedCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
            <p className="mt-2 font-mono text-xl font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {!result && !loading && !error && (
        <div className="mt-4 rounded-lg border border-dashed border-trading-border p-8 text-center text-xs text-slate-500">
          Run the complete scanner to validate up to three 5M entries against the latest confirmed 15M swing and construct a fixed 2R target.
        </div>
      )}

      {loading && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-trading-border bg-dark-bg/40 py-10 text-xs text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Running liquidity, trend, setup, entry and risk stages…
        </div>
      )}

      {result && !loading && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Completed in {formatNumber(result.durationMs / 1000, 1)} sec · Risk concurrency {result.limits.riskConcurrency}
            </span>
            <span>{new Date(result.generatedAt).toLocaleString()}</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-trading-border">
            <table className="w-full min-w-[1120px] text-left text-xs">
              <thead className="bg-dark-bg/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Symbol</th>
                  <th className="px-3 py-3">Direction</th>
                  <th className="px-3 py-3 text-right">Entry</th>
                  <th className="px-3 py-3 text-right">Stop Loss</th>
                  <th className="px-3 py-3 text-right">2R Target</th>
                  <th className="px-3 py-3 text-right">R:R</th>
                  <th className="px-3 py-3 text-right">Risk</th>
                  <th className="px-3 py-3">15M Swing</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.finalCandidates.selected.map((candidate) => (
                  <tr key={candidate.signalCandidateKey ?? candidate.entryKey} className="border-t border-trading-border/70 text-slate-300">
                    <td className="px-3 py-3 font-mono text-slate-500">{candidate.candidateRank}</td>
                    <td className="px-3 py-3">
                      <p className="font-mono font-bold text-slate-100">{candidate.symbol}</p>
                      <p className="mt-1 text-[9px] text-slate-600">U#{candidate.universeRank} · 1H#{candidate.oneHourRank} · 15M#{candidate.setupRank} · 5M#{candidate.entryRank}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded px-2 py-1 font-mono text-[10px] font-bold ${directionClass(candidate.direction)}`}>
                        {candidate.direction}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{formatNumber(candidate.entryPrice)}</td>
                    <td className="px-3 py-3 text-right font-mono text-rose-300">{formatNumber(candidate.stopLoss)}</td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-300">{formatNumber(candidate.targetPrice)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-emerald-400">1:{formatNumber(candidate.riskRewardRatio, 2)}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatNumber(candidate.riskBps, 2)} bps</td>
                    <td className="px-3 py-3">
                      <p className="font-mono">{formatNumber(candidate.swingPrice)}</p>
                      <p className="mt-1 text-[9px] text-slate-600">{formatTimestamp(candidate.swingCandleCloseTimeMs)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> CANDIDATE
                      </span>
                    </td>
                  </tr>
                ))}
                {result.finalCandidates.selected.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                      No entry passed the complete pipeline and 15M swing risk validation. No quota was filled artificially.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {result.finalCandidates.rejected.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Risk rejections
              </p>
              <div className="mt-2 space-y-2">
                {result.finalCandidates.rejected.map((item) => (
                  <div key={`${item.symbol}-${item.entryRank}`} className="rounded border border-trading-border bg-dark-bg/40 p-2 text-[10px]">
                    <span className="font-mono font-bold text-slate-200">{item.symbol} {item.direction}</span>
                    <span className="ml-2 text-slate-500">{item.reasons.join(' · ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.finalCandidates.failures.length > 0 && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-rose-300">Risk service failures</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.finalCandidates.failures.map((failure) => (
                  <span key={`${failure.entryKey}-${failure.code}`} className="rounded border border-rose-500/20 px-2 py-1 font-mono text-[10px] text-rose-200">
                    {failure.symbol}: {failure.code}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-trading-border bg-dark-bg/50 p-3 text-[10px] text-slate-500">
            Policy: <span className="font-mono text-slate-300">{result.riskPolicy}</span>. Final candidates are not persisted as signals and cannot place orders.
          </div>
        </div>
      )}
    </div>
  );
}
