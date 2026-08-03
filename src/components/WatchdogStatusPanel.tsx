import React from 'react';
import { Activity, AlertTriangle, Clock, RefreshCw, ShieldCheck } from 'lucide-react';

interface WatchdogStatusPanelProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

type WatchdogState = 'DISABLED' | 'IDLE' | 'RUNNING' | 'HEALTHY' | 'DEGRADED' | 'FAILED';

interface WatchdogStatus {
  service: 'pipeline-watchdog';
  enabled: boolean;
  state: WatchdogState;
  intervalMs: number;
  runTimeoutMs: number;
  running: boolean;
  nextRunAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  skippedOverlaps: number;
  skippedDuplicateCycles: number;
  signalPersistenceEnabled: false;
  executionEnabled: false;
  lastRun: null | {
    runId: string;
    trigger: 'SCHEDULED' | 'STARTUP' | 'TEST';
    scheduledAt: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    scheduleDriftMs: number;
    state: 'RUNNING' | 'HEALTHY' | 'DEGRADED' | 'FAILED';
    dependencies: {
      marketData: boolean;
      pythonEngine: boolean;
      bybitDemo: boolean;
      clockSkewMs: number | null;
      pythonReason: string | null;
      demoReason: string | null;
    };
    counts: null | {
      universe: number;
      oneHour: number;
      fifteenMinute: number;
      fiveMinute: number;
      finalCandidates: number;
    };
    issues: string[];
  };
}

function formatTime(value: string | null): string {
  if (!value) return 'Not yet';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Invalid timestamp' : parsed.toLocaleString();
}

function stateClass(state: WatchdogState): string {
  if (state === 'HEALTHY') return 'text-emerald-400';
  if (state === 'DEGRADED' || state === 'RUNNING') return 'text-amber-400';
  if (state === 'FAILED' || state === 'DISABLED') return 'text-rose-400';
  return 'text-slate-300';
}

export default function WatchdogStatusPanel({
  apiBaseUrl,
  onTriggerNoBackendWarning,
}: WatchdogStatusPanelProps) {
  const [status, setStatus] = React.useState<WatchdogStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadStatus = React.useCallback(async (notifyOnError = false) => {
    if (!apiBaseUrl) {
      const message = 'VITE_API_BASE_URL is not configured.';
      setError(message);
      if (notifyOnError) onTriggerNoBackendWarning(message);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/watchdog/status`, {
        headers: { accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null) as WatchdogStatus | { error?: { code?: string } } | null;
      if (!response.ok || !payload || !('service' in payload)) {
        const code = payload && 'error' in payload ? payload.error?.code : null;
        throw new Error(code || `WATCHDOG_HTTP_${response.status}`);
      }
      setStatus(payload);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'WATCHDOG_STATUS_UNAVAILABLE';
      setError(message);
      if (notifyOnError) onTriggerNoBackendWarning(message);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, onTriggerNoBackendWarning]);

  React.useEffect(() => {
    void loadStatus(false);
    const timer = window.setInterval(() => void loadStatus(false), 30_000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  const counts = status?.lastRun?.counts;
  const dependencies = status?.lastRun?.dependencies;
  const issues = status?.lastRun?.issues ?? [];

  return (
    <section className="max-w-5xl rounded-xl border border-trading-border bg-card-bg p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Activity className="h-4 w-4 text-brand-bybit" />
            Pipeline Watchdog Worker
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Supervises the 50 → 20 → 10 → 3 pipeline every 15 minutes. It does not persist signals or execute trades.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus(true)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-trading-border px-3 py-2 text-xs text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && !status && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {status && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-trading-border bg-dark-bg p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">State</span>
              <div className={`mt-1 font-mono text-sm font-bold ${stateClass(status.state)}`}>{status.state}</div>
            </div>
            <div className="rounded-lg border border-trading-border bg-dark-bg p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Interval</span>
              <div className="mt-1 font-mono text-sm text-slate-200">{Math.round(status.intervalMs / 60_000)} min</div>
            </div>
            <div className="rounded-lg border border-trading-border bg-dark-bg p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Failures</span>
              <div className="mt-1 font-mono text-sm text-slate-200">{status.consecutiveFailures}</div>
            </div>
            <div className="rounded-lg border border-trading-border bg-dark-bg p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Overlap Blocks</span>
              <div className="mt-1 font-mono text-sm text-slate-200">{status.skippedOverlaps}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-trading-border bg-dark-bg p-3 text-xs">
              <div className="flex items-center gap-2 text-slate-500"><Clock className="h-4 w-4" />Next run</div>
              <div className="mt-1 text-slate-200">{formatTime(status.nextRunAt)}</div>
            </div>
            <div className="rounded-lg border border-trading-border bg-dark-bg p-3 text-xs">
              <div className="flex items-center gap-2 text-slate-500"><ShieldCheck className="h-4 w-4" />Last success</div>
              <div className="mt-1 text-slate-200">{formatTime(status.lastSuccessAt)}</div>
            </div>
            <div className="rounded-lg border border-trading-border bg-dark-bg p-3 text-xs">
              <div className="text-slate-500">Last run duration</div>
              <div className="mt-1 font-mono text-slate-200">
                {status.lastRun?.durationMs === null || status.lastRun?.durationMs === undefined
                  ? 'Not completed'
                  : `${status.lastRun.durationMs} ms`}
              </div>
            </div>
          </div>

          {counts && (
            <div className="rounded-lg border border-trading-border bg-dark-bg p-4">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Last pipeline counts</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['Top Universe', counts.universe],
                  ['1H Trend', counts.oneHour],
                  ['15M Setup', counts.fifteenMinute],
                  ['5M Entry', counts.fiveMinute],
                  ['Final', counts.finalCandidates],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border border-trading-border/70 p-2 text-center">
                    <div className="text-[10px] text-slate-500">{label}</div>
                    <div className="mt-1 font-mono text-lg font-bold text-slate-100">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dependencies && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['Market Data', dependencies.marketData, dependencies.clockSkewMs === null ? null : `${dependencies.clockSkewMs} ms skew`],
                ['Python Engine', dependencies.pythonEngine, dependencies.pythonReason],
                ['Bybit Demo', dependencies.bybitDemo, dependencies.demoReason],
              ].map(([label, ok, detail]) => (
                <div key={String(label)} className="rounded-lg border border-trading-border bg-dark-bg p-3 text-xs">
                  <div className={ok ? 'text-emerald-400' : 'text-rose-400'}>{label}: {ok ? 'ONLINE' : 'FAILED'}</div>
                  {detail && <div className="mt-1 break-all font-mono text-[10px] text-slate-500">{String(detail)}</div>}
                </div>
              ))}
            </div>
          )}

          {issues.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <AlertTriangle className="h-4 w-4" />Last run issues
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {issues.map((issue) => (
                  <span key={issue} className="rounded border border-amber-500/20 bg-dark-bg px-2 py-1 font-mono text-[10px] text-amber-200">
                    {issue}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] text-slate-600">
            Safety lock: signal persistence OFF · execution OFF · duplicate cycle blocks {status.skippedDuplicateCycles}
          </div>
        </div>
      )}
    </section>
  );
}
