import React from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Target } from 'lucide-react';

type Direction = 'LONG' | 'SHORT';

interface UnifiedScannerPipelineViewProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

interface FinalCandidate {
  candidateRank: number;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  stopLoss: number | null;
  targetPrice: number | null;
  riskRewardRatio: number | null;
  riskBps: number | null;
  signalCandidateKey: string | null;
  entryKey: string;
  reasons: string[];
}

interface PipelineStage {
  selectedCount: number;
  failedCount?: number;
  rejectedCount?: number;
  duplicateCount?: number;
}

interface UnifiedPipelineResponse {
  generatedAt: string;
  durationMs: number;
  universe: PipelineStage;
  oneHour: PipelineStage;
  fifteenMinute: PipelineStage;
  fiveMinute: PipelineStage;
  finalCandidates: PipelineStage & {
    selected: FinalCandidate[];
    rejected: Array<{ symbol: string; direction: Direction; reasons: string[] }>;
    failures: Array<{ symbol: string; code: string }>;
  };
  signalGenerationEnabled: false;
  actionable: false;
  executionEnabled: false;
}

const REQUEST_TIMEOUT_MS = 180_000;

function formatNumber(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function directionClass(direction: Direction): string {
  return direction === 'LONG'
    ? 'bg-emerald-500/10 text-emerald-400'
    : 'bg-rose-500/10 text-rose-400';
}

async function requestPipeline(url: string): Promise<UnifiedPipelineResponse> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`NON_JSON_RESPONSE_HTTP_${response.status}`);
  }
  const payload = (await response.json().catch(() => null)) as
    | UnifiedPipelineResponse
    | { error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    const errorPayload = payload as { error?: { code?: string; message?: string } } | null;
    throw new Error(errorPayload?.error?.code || errorPayload?.error?.message || `HTTP_${response.status}`);
  }
  if (!payload || !('finalCandidates' in payload)) throw new Error('INVALID_PIPELINE_RESPONSE');
  return payload;
}

export default function UnifiedScannerPipelineView({
  apiBaseUrl,
  onTriggerNoBackendWarning,
}: UnifiedScannerPipelineViewProps) {
  const [result, setResult] = React.useState<UnifiedPipelineResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const runScan = React.useCallback(async () => {
    if (!apiBaseUrl) {
      onTriggerNoBackendWarning('VITE_API_BASE_URL is not configured.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setResult(await requestPipeline(`${apiBaseUrl}/api/scanner/batch/five-minute`));
    } catch (scanError) {
      setResult(null);
      setError(scanError instanceof Error ? scanError.message : 'UNIFIED_PIPELINE_FAILED');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, onTriggerNoBackendWarning]);

  const issues = result
    ? (result.oneHour.failedCount ?? 0) +
      (result.fifteenMinute.failedCount ?? 0) +
      (result.fiveMinute.failedCount ?? 0) +
      (result.finalCandidates.failedCount ?? 0)
    : 0;

  return (
    <section className="rounded-xl border border-emerald-500/20 bg-card-bg p-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-trading-border/70 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Unified Market Scanner
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            One request and one timestamp for the complete closed-candle 50 → 20 → 10 → 3 → final-risk pipeline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 font-mono text-[10px] text-amber-300">
            SIGNAL PERSISTENCE: WORKER ONLY · EXECUTION OFF
          </span>
          <button
            type="button"
            onClick={() => void runScan()}
            disabled={loading || !apiBaseUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
            {loading ? 'Running Full Pipeline…' : 'Run Unified Scan'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          Scan failed: <span className="font-mono">{error}</span>. Existing results were cleared and no candidate was fabricated.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Top Universe', result?.universe.selectedCount ?? 0],
          ['1H Trend', result?.oneHour.selectedCount ?? 0],
          ['15M Setup', result?.fifteenMinute.selectedCount ?? 0],
          ['5M Entry', result?.fiveMinute.selectedCount ?? 0],
          ['Final Candidate', result?.finalCandidates.selectedCount ?? 0],
          ['Stage Failures', issues],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
            <p className="mt-2 font-mono text-xl font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {!result && !loading && !error && (
        <div className="mt-4 rounded-lg border border-dashed border-trading-border p-8 text-center text-xs text-slate-500">
          No manual snapshot yet. The automated worker continues independently every 15 minutes.
        </div>
      )}

      {loading && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-trading-border bg-dark-bg/40 py-10 text-xs text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" /> Running all scanner and final-risk stages from one backend snapshot…
        </div>
      )}

      {result && !loading && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>Completed in {formatNumber(result.durationMs / 1000, 1)} sec</span>
            <span>Snapshot: {new Date(result.generatedAt).toLocaleString()}</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-trading-border">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="bg-dark-bg/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Symbol</th>
                  <th className="px-3 py-3">Direction</th>
                  <th className="px-3 py-3 text-right">Entry</th>
                  <th className="px-3 py-3 text-right">Stop</th>
                  <th className="px-3 py-3 text-right">Target</th>
                  <th className="px-3 py-3 text-right">R:R</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.finalCandidates.selected.map((candidate) => (
                  <tr key={candidate.signalCandidateKey ?? candidate.entryKey} className="border-t border-trading-border/70 text-slate-300">
                    <td className="px-3 py-3 font-mono text-slate-500">{candidate.candidateRank}</td>
                    <td className="px-3 py-3 font-mono font-bold text-slate-100">{candidate.symbol}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded px-2 py-1 font-mono text-[10px] font-bold ${directionClass(candidate.direction)}`}>
                        {candidate.direction}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{formatNumber(candidate.entryPrice)}</td>
                    <td className="px-3 py-3 text-right font-mono text-rose-300">{formatNumber(candidate.stopLoss)}</td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-300">{formatNumber(candidate.targetPrice)}</td>
                    <td className="px-3 py-3 text-right font-mono">1:{formatNumber(candidate.riskRewardRatio, 2)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> FINAL CANDIDATE
                      </span>
                    </td>
                  </tr>
                ))}
                {result.finalCandidates.selected.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                      No symbol passed every stage in this snapshot. Zero final candidates is a valid strategy result.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(result.finalCandidates.rejected.length > 0 || result.finalCandidates.failures.length > 0) && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Final-stage rejection and failure evidence
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.finalCandidates.rejected.map((item, index) => (
                  <span key={`${item.symbol}-${index}`} className="rounded border border-amber-500/20 px-2 py-1 font-mono text-[10px] text-amber-200">
                    {item.symbol} {item.direction}: {item.reasons.join(', ')}
                  </span>
                ))}
                {result.finalCandidates.failures.map((item, index) => (
                  <span key={`${item.symbol}-${item.code}-${index}`} className="rounded border border-rose-500/20 px-2 py-1 font-mono text-[10px] text-rose-300">
                    {item.symbol}: {item.code}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-trading-border bg-dark-bg/50 p-3 text-[10px] text-slate-500">
            Manual scan is analysis-only. The scheduled Signal Worker persists qualifying final candidates to Supabase and updates duplicate <span className="font-mono">seen_count</span>. Trade execution remains disabled.
          </div>
        </div>
      )}
    </section>
  );
}
