import React from 'react';
import {
  Activity,
  ClipboardList,
  Cpu,
  Database,
  FileText,
  Link,
  Percent,
  Power,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react';

interface DashboardViewProps {
  apiBaseUrl: string;
  onStartEngineClick: () => void;
}

type EngineStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'BLOCKED';

interface DashboardSummary {
  connected: boolean;
  tradingMode: 'bybit_demo';
  engineStatus: EngineStatus;
  executionEnabled: false;
  account: null | {
    totalEquity: number;
    walletBalance: number;
    availableBalance: number;
    unrealisedPnl: number;
  };
  today: null | {
    realisedPnl: number;
    unrealisedPnl: number;
    totalPnl: number;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  openTrades: Array<{
    symbol: string;
    side: string;
    size: number;
    avgPrice: number;
    markPrice: number;
    unrealisedPnl: number;
  }>;
  activeStrategy: string | null;
  recentActivity: Array<{ id: string; type: string; message: string; createdAt: string }>;
  reason: string | null;
}

interface SystemHealth {
  ready: boolean;
  tradingMode: string;
  executionEnabled: false;
  dependencies: {
    marketData: boolean;
    pythonEngine: boolean;
    bybitDemo: boolean;
  };
  clockSkewMs?: number;
}

const REQUEST_TIMEOUT_MS = 15000;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | T | null;
  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    throw new Error(errorBody?.error?.code || errorBody?.error?.message || `HTTP_${response.status}`);
  }
  return body as T;
}

function MetricCard({ title, value, suffix, icon: Icon, connected }: {
  title: string;
  value: string;
  suffix: string;
  icon: React.ComponentType<{ className?: string }>;
  connected: boolean;
}) {
  return (
    <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">{title}</span>
        <div className="rounded-md bg-dark-bg p-1.5 text-slate-400"><Icon className="h-4 w-4" /></div>
      </div>
      <div className="mt-3">
        <span className="font-mono text-xl font-bold tracking-tight text-slate-100">{value}</span>
        <span className="ml-1 font-mono text-xs font-semibold text-slate-500">{suffix}</span>
      </div>
      <div className={`mt-2 text-[10px] font-medium ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>
        {connected ? 'Live backend data' : 'Not Connected'}
      </div>
    </div>
  );
}

export default function DashboardView({ apiBaseUrl, onStartEngineClick }: DashboardViewProps) {
  const [summary, setSummary] = React.useState<DashboardSummary | null>(null);
  const [health, setHealth] = React.useState<SystemHealth | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionPending, setActionPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(async () => {
    if (!apiBaseUrl) {
      setError('VITE_API_BASE_URL_NOT_CONFIGURED');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, healthResult] = await Promise.all([
        requestJson<DashboardSummary>(`${apiBaseUrl}/api/dashboard/summary`),
        requestJson<SystemHealth>(`${apiBaseUrl}/api/dashboard/system-health`),
      ]);
      setSummary(summaryResult);
      setHealth(healthResult);
    } catch (loadError) {
      setSummary(null);
      setHealth(null);
      setError(loadError instanceof Error ? loadError.message : 'DASHBOARD_LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  React.useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const changeEngineState = async (action: 'start' | 'stop') => {
    if (!apiBaseUrl) {
      onStartEngineClick();
      return;
    }
    setActionPending(true);
    setError(null);
    try {
      await requestJson(`${apiBaseUrl}/api/dashboard/engine/${action}`, { method: 'POST' });
      await loadDashboard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'ENGINE_ACTION_FAILED');
    } finally {
      setActionPending(false);
    }
  };

  const connected = summary?.connected === true;
  const engineStatus = summary?.engineStatus ?? 'BLOCKED';
  const engineRunning = engineStatus === 'RUNNING';
  const statusTone = engineRunning ? 'text-emerald-400' : engineStatus === 'STOPPED' ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Live Workspace Status</h2>
          <p className="mt-1 text-xs text-slate-500">Real Bybit Demo metrics through the Node authority service.</p>
        </div>
        <button
          onClick={() => void loadDashboard()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-trading-border bg-card-bg px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          Dashboard unavailable: <span className="font-mono">{error}</span>. No fallback data is shown.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard title="Demo Balance" value={(summary?.account?.totalEquity ?? 0).toFixed(2)} suffix="USDT" icon={Wallet} connected={connected} />
        <MetricCard title="Today's P&L" value={(summary?.today?.totalPnl ?? 0).toFixed(2)} suffix="USDT" icon={TrendingUp} connected={connected} />
        <MetricCard title="Open Trades" value={String(summary?.openTrades.length ?? 0)} suffix="Positions" icon={Activity} connected={connected} />
        <MetricCard title="Today's Trades" value={String(summary?.today?.trades ?? 0)} suffix="Completed" icon={ClipboardList} connected={connected} />
        <MetricCard title="Win Rate" value={(summary?.today?.winRate ?? 0).toFixed(1)} suffix="%" icon={Percent} connected={connected} />
        <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Engine Status</span>
            <div className="rounded-md bg-dark-bg p-1.5 text-slate-400"><Power className="h-4 w-4" /></div>
          </div>
          <div className="mt-3"><span className={`text-base font-bold uppercase ${statusTone}`}>{loading ? 'LOADING' : engineStatus}</span></div>
          <div className="mt-2.5 text-[10px] text-slate-400">Execution remains disabled</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-trading-border/80 pb-4">
              <div className="flex items-center gap-2"><Cpu className="h-4 w-4 text-brand-bybit" /><h3 className="text-sm font-semibold text-slate-100">Active Strategy Summary</h3></div>
              <span className={`font-mono text-[11px] font-semibold uppercase ${engineRunning ? 'text-emerald-400' : 'text-slate-500'}`}>{summary?.activeStrategy ?? 'No active strategy'}</span>
            </div>
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-slate-300">{engineRunning ? 'Strategy engine is running' : 'Strategy engine is stopped'}</p>
              <p className="mt-1 text-xs text-slate-500">Start requires healthy market data, Python readiness, and configured Bybit Demo credentials.</p>
              <div className="mt-4 flex justify-center gap-3">
                <button onClick={() => void changeEngineState('start')} disabled={actionPending || engineRunning || !connected} className="rounded-lg bg-brand-bybit px-4 py-2 text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">Start Engine</button>
                <button onClick={() => void changeEngineState('stop')} disabled={actionPending || !engineRunning} className="rounded-lg border border-trading-border bg-dark-bg px-4 py-2 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-40">Stop Engine</button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-trading-border/80 pb-4">
              <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-brand-bybit" /><h3 className="text-sm font-semibold text-slate-100">Active Trades Preview</h3></div>
              <span className="rounded-full border border-trading-border bg-dark-bg px-2 py-0.5 text-[10px] font-semibold text-slate-400">{summary?.openTrades.length ?? 0} Active</span>
            </div>
            {(summary?.openTrades.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">No open Bybit Demo positions.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {summary?.openTrades.map((trade) => (
                  <div key={`${trade.symbol}-${trade.side}`} className="grid grid-cols-2 gap-2 rounded-lg border border-trading-border bg-dark-bg/40 p-3 text-xs sm:grid-cols-5">
                    <span className="font-bold text-slate-200">{trade.symbol}</span><span>{trade.side}</span><span>Qty {trade.size}</span><span>Mark {trade.markPrice}</span><span className={trade.unrealisedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{trade.unrealisedPnl.toFixed(2)} USDT</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-trading-border/80 pb-4"><ShieldCheck className="h-4 w-4 text-brand-bybit" /><h3 className="text-sm font-semibold text-slate-100">System Health</h3></div>
            <div className="mt-4 space-y-3">
              {[
                ['Host Connection', Boolean(health), Link],
                ['Market Data', health?.dependencies.marketData ?? false, Database],
                ['Python Engine', health?.dependencies.pythonEngine ?? false, Cpu],
                ['Bybit Demo', health?.dependencies.bybitDemo ?? false, Wallet],
              ].map(([label, ok, Icon]) => {
                const StatusIcon = Icon as React.ComponentType<{ className?: string }>;
                return <div key={String(label)} className="flex items-center justify-between rounded-lg border border-trading-border bg-dark-bg/40 p-3"><div className="flex items-center gap-2"><StatusIcon className="h-4 w-4 text-slate-500" /><span className="text-xs font-semibold text-slate-300">{String(label)}</span></div><span className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{ok ? 'ONLINE' : 'OFFLINE'}</span></div>;
              })}
            </div>
            <p className="mt-4 border-t border-trading-border/80 pt-3 text-center text-[11px] text-slate-500">Clock skew: {health?.clockSkewMs ?? '—'} ms</p>
          </div>

          <div className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-trading-border/80 pb-4"><FileText className="h-4 w-4 text-brand-bybit" /><h3 className="text-sm font-semibold text-slate-100">Recent Activity</h3></div>
            {(summary?.recentActivity.length ?? 0) === 0 ? <p className="py-8 text-center text-xs text-slate-500">No backend activity recorded.</p> : <div className="mt-4 space-y-3">{summary?.recentActivity.map((item) => <div key={item.id} className="rounded-lg border border-trading-border bg-dark-bg/40 p-3"><p className="text-xs text-slate-300">{item.message}</p><p className="mt-1 text-[10px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</p></div>)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
