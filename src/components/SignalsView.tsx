import React from 'react';
import {
  AlertTriangle,
  Clock,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';

interface SignalsViewProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

type Direction = 'LONG' | 'SHORT';

interface StoredSignal {
  signalCandidateKey: string;
  symbol: string;
  direction: Direction;
  status: 'VALID';
  executionStatus: 'NOT_EXECUTED';
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskRewardRatio: number;
  riskBps: number;
  volumeRatio: number;
  sweepDepthBps: number;
  entryCandleCloseTimeMs: number;
  swingCandleCloseTimeMs: number;
  reasons: string[];
  candidateRank: number;
  createdAt: string;
  lastSeenAt: string;
  seenCount: number;
  actionable: false;
}

interface SignalsResponse {
  generatedAt: string;
  count: number;
  summary: {
    validCount: number;
    longCount: number;
    shortCount: number;
    repeatSeenCount: number;
    executedCount: 0;
  };
  storage: {
    mode: 'SUPABASE_POSTGRES';
    table: 'public.trade_signals';
    atomicDuplicatePolicy?: string;
  };
  signals: StoredSignal[];
  actionable: false;
  executionEnabled: false;
}

interface ScanResponse {
  generatedAt: string;
  pipelineCounts: {
    universe: number;
    oneHour: number;
    fifteenMinute: number;
    fiveMinute: number;
    finalCandidates: number;
  };
  persistence: {
    insertedCount: number;
    duplicateSuppressedCount: number;
    totalStored: number;
  };
  actionable: false;
  executionEnabled: false;
}

const REQUEST_TIMEOUT_MS = 30_000;
const SCAN_TIMEOUT_MS = 180_000;

async function readError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { code?: string; message?: string } };
    return payload.error?.code || payload.error?.message || `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}

async function requestJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) throw new Error(`NON_JSON_RESPONSE_HTTP_${response.status}`);
  if (!response.ok) throw new Error(await readError(response));
  return await response.json() as T;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function formatTime(value: string | number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export default function SignalsView({ apiBaseUrl, onTriggerNoBackendWarning }: SignalsViewProps) {
  const [symbolSearch, setSymbolSearch] = React.useState('');
  const [directionFilter, setDirectionFilter] = React.useState<'ALL' | Direction>('ALL');
  const [signalsData, setSignalsData] = React.useState<SignalsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isScanning, setIsScanning] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<ScanResponse | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);

  const loadSignals = React.useCallback(async (showWarning: boolean) => {
    if (!apiBaseUrl) {
      const code = 'VITE_API_BASE_URL_NOT_CONFIGURED';
      setErrorCode(code);
      setIsLoading(false);
      if (showWarning) onTriggerNoBackendWarning(code);
      return;
    }
    setIsLoading(true);
    try {
      const payload = await requestJson<SignalsResponse>(
        `${apiBaseUrl}/api/signals?limit=200`,
        { method: 'GET' },
        REQUEST_TIMEOUT_MS,
      );
      if (payload.storage.mode !== 'SUPABASE_POSTGRES') throw new Error('UNEXPECTED_SIGNAL_STORAGE_MODE');
      setSignalsData(payload);
      setErrorCode(null);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'SIGNALS_FETCH_FAILED';
      setErrorCode(code);
      if (showWarning) onTriggerNoBackendWarning(code);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, onTriggerNoBackendWarning]);

  React.useEffect(() => { void loadSignals(false); }, [loadSignals]);

  const handleScanAndPersist = async () => {
    if (!apiBaseUrl) return onTriggerNoBackendWarning('VITE_API_BASE_URL_NOT_CONFIGURED');
    setIsScanning(true);
    try {
      const payload = await requestJson<ScanResponse>(
        `${apiBaseUrl}/api/signals/scan`,
        { method: 'POST' },
        SCAN_TIMEOUT_MS,
      );
      setLastScan(payload);
      setErrorCode(null);
      await loadSignals(false);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'SIGNAL_SCAN_FAILED';
      setErrorCode(code);
      onTriggerNoBackendWarning(code);
    } finally {
      setIsScanning(false);
    }
  };

  const filteredSignals = React.useMemo(() => {
    const search = symbolSearch.trim().toUpperCase();
    return (signalsData?.signals ?? []).filter((signal) =>
      (!search || signal.symbol.includes(search)) &&
      (directionFilter === 'ALL' || signal.direction === directionFilter),
    );
  }, [directionFilter, signalsData, symbolSearch]);

  const summary = signalsData?.summary ?? {
    validCount: 0, longCount: 0, shortCount: 0, repeatSeenCount: 0, executedCount: 0 as const,
  };

  const noMatches = Boolean(signalsData?.signals.length) && filteredSignals.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-trading-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <Zap className="h-5 w-5 text-brand-bybit" /> Persistent Signals
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Supabase-backed final risk candidates. Every record is non-actionable and not executed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-trading-border bg-card-bg px-3 py-2 text-[11px]">
            <span className={errorCode ? 'text-rose-400' : 'text-emerald-400'}>
              {errorCode ? `DEGRADED: ${errorCode}` : 'SUPABASE ONLINE'}
            </span>
            <span className="mx-2 text-slate-600">|</span>
            <span className="font-mono text-slate-400">
              {signalsData ? formatTime(signalsData.generatedAt) : 'Not synced'}
            </span>
          </div>
          <button
            onClick={() => void loadSignals(true)}
            disabled={isLoading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-trading-border bg-card-bg text-slate-400 disabled:opacity-50"
            title="Refresh stored signals"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => void handleScanAndPersist()}
            disabled={isScanning || isLoading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-semibold text-brand-bybit disabled:opacity-50"
          >
            <Zap className={`h-4 w-4 ${isScanning ? 'animate-pulse' : ''}`} />
            {isScanning ? 'Scanning full pipeline…' : 'Scan & Persist'}
          </button>
        </div>
      </div>

      {errorCode && signalsData && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Refresh failed. The last successful Supabase snapshot remains visible; it was not replaced with fabricated data.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['Valid Signals', summary.validCount, 'text-brand-bybit'],
          ['Long Signals', summary.longCount, 'text-emerald-400'],
          ['Short Signals', summary.shortCount, 'text-rose-400'],
          ['Repeat Sightings', summary.repeatSeenCount, 'text-sky-400'],
          ['Executed', summary.executedCount, 'text-slate-400'],
        ].map(([name, value, tone]) => (
          <div key={String(name)} className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{name}</span>
            <span className={`mt-2 block font-mono text-xl font-bold ${tone}`}>{value}</span>
          </div>
        ))}
      </div>

      {lastScan && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-slate-300">
          <span className="font-semibold text-emerald-400">Last scan:</span>{' '}
          <span className="font-mono">
            {lastScan.pipelineCounts.universe} → {lastScan.pipelineCounts.oneHour} → {lastScan.pipelineCounts.fifteenMinute} → {lastScan.pipelineCounts.fiveMinute} → {lastScan.pipelineCounts.finalCandidates}
          </span>
          <span className="ml-4">Inserted {lastScan.persistence.insertedCount}</span>
          <span className="ml-4">Duplicates updated {lastScan.persistence.duplicateSuppressedCount}</span>
          <span className="ml-4">Total {lastScan.persistence.totalStored}</span>
        </div>
      )}

      <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b border-trading-border/50 pb-3">
          <SlidersHorizontal className="h-4 w-4 text-brand-bybit" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Signal Screening</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-600" />
            <input
              value={symbolSearch}
              onChange={(event) => setSymbolSearch(event.target.value.toUpperCase())}
              placeholder="BTCUSDT"
              className="w-full rounded-lg border border-trading-border bg-dark-bg py-2 pl-9 pr-3 font-mono text-xs text-slate-100"
            />
          </div>
          <select
            value={directionFilter}
            onChange={(event) => setDirectionFilter(event.target.value as 'ALL' | Direction)}
            className="rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs text-slate-300"
          >
            <option value="ALL">All directions</option>
            <option value="LONG">Long</option>
            <option value="SHORT">Short</option>
          </select>
        </div>
      </div>

      {isLoading && !signalsData ? (
        <div className="rounded-xl border border-trading-border bg-card-bg p-12 text-center text-xs text-slate-400">
          <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin" /> Loading Supabase signals…
        </div>
      ) : errorCode && !signalsData ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-10 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-400" />
          <p className="mt-3 text-sm font-semibold text-rose-200">Signal store unavailable</p>
          <p className="mt-2 font-mono text-xs text-rose-300">{errorCode}</p>
        </div>
      ) : filteredSignals.length === 0 ? (
        <div className="rounded-xl border border-trading-border bg-card-bg p-12 text-center shadow-sm">
          <Database className="mx-auto h-10 w-10 text-slate-600" />
          <h3 className="mt-4 text-base font-semibold text-slate-200">
            {noMatches ? 'No signal matches the filters' : 'No persisted signal found'}
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-xs text-slate-400">
            {noMatches
              ? 'Clear or change the symbol and direction filters.'
              : 'Zero signals is valid until a symbol passes every closed-candle stage and final risk validation.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredSignals.map((signal) => (
            <article key={signal.signalCandidateKey} className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-bold text-slate-100">{signal.symbol}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${signal.direction === 'LONG' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{signal.direction}</span>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">NOT_EXECUTED</span>
                </div>
                <span className="text-[10px] text-slate-500">Seen {signal.seenCount}×</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Entry', formatPrice(signal.entryPrice), 'text-slate-100'],
                  ['Stop Loss', formatPrice(signal.stopLoss), 'text-rose-400'],
                  ['Target', formatPrice(signal.targetPrice), 'text-emerald-400'],
                  ['R:R / Risk', `1:${signal.riskRewardRatio.toFixed(2)} · ${signal.riskBps.toFixed(1)} bps`, 'text-brand-bybit'],
                ].map(([label, value, tone]) => (
                  <div key={String(label)} className="rounded-lg bg-dark-bg p-3">
                    <span className="block text-[9px] uppercase text-slate-500">{label}</span>
                    <span className={`mt-1 block font-mono text-xs ${tone}`}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-2 text-[10px] text-slate-400 sm:grid-cols-2">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> First seen: {formatTime(signal.createdAt)}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last seen: {formatTime(signal.lastSeenAt)}</span>
                <span>Entry candle: {formatTime(signal.entryCandleCloseTimeMs)}</span>
                <span>Swing candle: {formatTime(signal.swingCandleCloseTimeMs)}</span>
                <span>Volume {signal.volumeRatio.toFixed(2)}×</span>
                <span>Sweep {signal.sweepDepthBps.toFixed(1)} bps</span>
              </div>

              {signal.reasons.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {signal.reasons.map((reason) => (
                    <span key={reason} className="rounded border border-trading-border bg-dark-bg px-2 py-1 font-mono text-[9px] text-slate-400">{reason}</span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-trading-border/60 pt-3 text-[10px]">
                <span className="inline-flex items-center gap-1 text-emerald-400"><ShieldCheck className="h-3 w-3" /> Supabase deduplicated</span>
                <span className="inline-flex items-center gap-1 text-amber-400"><AlertTriangle className="h-3 w-3" /> Actionable false</span>
              </div>
              <div className="mt-3 break-all rounded-lg border border-trading-border bg-dark-bg px-3 py-2 font-mono text-[9px] text-slate-600">{signal.signalCandidateKey}</div>
            </article>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-[10px] text-slate-400">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
        <span>
          Storage: {signalsData?.storage.mode ?? 'SUPABASE_POSTGRES'} · Table: {signalsData?.storage.table ?? 'public.trade_signals'} · Execution OFF.
        </span>
      </div>
    </div>
  );
}
