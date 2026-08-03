/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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

interface StoredSignal {
  signalCandidateKey: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
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
    mode: 'ATOMIC_JSON_FILE';
    deploymentDurability: string;
  };
  signals: StoredSignal[];
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
  executionEnabled: false;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { code?: string; message?: string } };
    return payload.error?.code || payload.error?.message || `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}

function formatPrice(value: number): string {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function formatTime(value: string | number): string {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export default function SignalsView({ apiBaseUrl, onTriggerNoBackendWarning }: SignalsViewProps) {
  const [symbolSearch, setSymbolSearch] = React.useState('');
  const [directionFilter, setDirectionFilter] = React.useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [signalsData, setSignalsData] = React.useState<SignalsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isScanning, setIsScanning] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<ScanResponse | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);

  const loadSignals = React.useCallback(async (showWarning: boolean) => {
    if (!apiBaseUrl) {
      const code = 'VITE_API_BASE_URL_NOT_CONFIGURED';
      setErrorCode(code);
      if (showWarning) onTriggerNoBackendWarning(code);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/signals?limit=200`);
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as SignalsResponse;
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

  React.useEffect(() => {
    void loadSignals(false);
  }, [loadSignals]);

  const handleScanAndPersist = async () => {
    if (!apiBaseUrl) {
      onTriggerNoBackendWarning('VITE_API_BASE_URL_NOT_CONFIGURED');
      return;
    }

    setIsScanning(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/signals/scan`, { method: 'POST' });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as ScanResponse;
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
    return (signalsData?.signals ?? []).filter((signal) => {
      if (search && !signal.symbol.includes(search)) return false;
      if (directionFilter !== 'ALL' && signal.direction !== directionFilter) return false;
      return true;
    });
  }, [directionFilter, signalsData, symbolSearch]);

  const summary = signalsData?.summary ?? {
    validCount: 0,
    longCount: 0,
    shortCount: 0,
    repeatSeenCount: 0,
    executedCount: 0 as const,
  };

  const summaryMetrics = [
    { name: 'Valid Signals', value: summary.validCount, tone: 'text-brand-bybit' },
    { name: 'Long Signals', value: summary.longCount, tone: 'text-emerald-400' },
    { name: 'Short Signals', value: summary.shortCount, tone: 'text-rose-400' },
    { name: 'Duplicates Blocked', value: summary.repeatSeenCount, tone: 'text-sky-400' },
    { name: 'Executed', value: summary.executedCount, tone: 'text-slate-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-trading-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <Zap className="h-5 w-5 text-brand-bybit" />
            Persistent Signals
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Final risk-approved candidates only. Persistence is enabled; execution remains disabled.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-trading-border bg-card-bg px-3 py-2 text-[11px]">
            <span className={errorCode ? 'text-rose-400' : 'text-emerald-400'}>
              {errorCode ? `ERROR: ${errorCode}` : 'STORE ONLINE'}
            </span>
            <span className="text-slate-600">|</span>
            <span className="font-mono text-slate-400">
              {signalsData ? formatTime(signalsData.generatedAt) : 'Not synced'}
            </span>
          </div>
          <button
            onClick={() => void loadSignals(true)}
            disabled={isLoading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-trading-border bg-card-bg text-slate-400 transition-colors hover:text-slate-100 disabled:cursor-wait disabled:opacity-50"
            title="Refresh stored signals"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => void handleScanAndPersist()}
            disabled={isScanning}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-semibold text-brand-bybit transition-colors hover:bg-amber-500/15 disabled:cursor-wait disabled:opacity-50"
          >
            <Zap className={`h-4 w-4 ${isScanning ? 'animate-pulse' : ''}`} />
            {isScanning ? 'Scanning full pipeline...' : 'Scan & Persist'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {summaryMetrics.map((metric) => (
          <div key={metric.name} className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {metric.name}
            </span>
            <span className={`mt-2 block font-mono text-xl font-bold ${metric.tone}`}>
              {metric.value}
            </span>
          </div>
        ))}
      </div>

      {lastScan && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-slate-300">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="font-semibold text-emerald-400">Last pipeline completed</span>
            <span className="font-mono">
              {lastScan.pipelineCounts.universe} → {lastScan.pipelineCounts.oneHour} →{' '}
              {lastScan.pipelineCounts.fifteenMinute} → {lastScan.pipelineCounts.fiveMinute} →{' '}
              {lastScan.pipelineCounts.finalCandidates}
            </span>
            <span>New: {lastScan.persistence.insertedCount}</span>
            <span>Duplicate blocked: {lastScan.persistence.duplicateSuppressedCount}</span>
            <span>Total stored: {lastScan.persistence.totalStored}</span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-trading-border bg-card-bg p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b border-trading-border/50 pb-3">
          <SlidersHorizontal className="h-4 w-4 text-brand-bybit" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Signal Screening</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">Symbol</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-600" />
              <input
                value={symbolSearch}
                onChange={(event) => setSymbolSearch(event.target.value.toUpperCase())}
                placeholder="BTCUSDT"
                className="w-full rounded-lg border border-trading-border bg-dark-bg py-2 pl-9 pr-3 font-mono text-xs text-slate-100 focus:border-brand-bybit focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-400">Direction</label>
            <select
              value={directionFilter}
              onChange={(event) => setDirectionFilter(event.target.value as 'ALL' | 'LONG' | 'SHORT')}
              className="w-full rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs text-slate-300 focus:border-brand-bybit focus:outline-none"
            >
              <option value="ALL">All directions</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>
          </div>
        </div>
      </div>

      {filteredSignals.length === 0 ? (
        <div className="rounded-xl border border-trading-border bg-card-bg p-12 text-center shadow-sm">
          <Database className="mx-auto h-10 w-10 text-slate-600" />
          <h3 className="mt-4 text-base font-semibold text-slate-200">No persisted signal found</h3>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-400">
            A signal is stored only when the full 50 → 20 → 10 → 3 pipeline and final 15M swing-risk validation pass. Zero signals is a valid result.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredSignals.map((signal) => (
            <article key={signal.signalCandidateKey} className="rounded-xl border border-trading-border bg-card-bg p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-slate-100">{signal.symbol}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${signal.direction === 'LONG' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {signal.direction}
                    </span>
                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-brand-bybit">
                      VALID
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">Candidate rank #{signal.candidateRank}</p>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  <div className="flex items-center justify-end gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(signal.createdAt)}
                  </div>
                  <div className="mt-1">Seen {signal.seenCount}×</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-dark-bg p-3">
                  <span className="block text-[9px] uppercase text-slate-500">Entry</span>
                  <span className="mt-1 block font-mono text-xs text-slate-100">{formatPrice(signal.entryPrice)}</span>
                </div>
                <div className="rounded-lg bg-dark-bg p-3">
                  <span className="block text-[9px] uppercase text-slate-500">Stop Loss</span>
                  <span className="mt-1 block font-mono text-xs text-rose-400">{formatPrice(signal.stopLoss)}</span>
                </div>
                <div className="rounded-lg bg-dark-bg p-3">
                  <span className="block text-[9px] uppercase text-slate-500">Target</span>
                  <span className="mt-1 block font-mono text-xs text-emerald-400">{formatPrice(signal.targetPrice)}</span>
                </div>
                <div className="rounded-lg bg-dark-bg p-3">
                  <span className="block text-[9px] uppercase text-slate-500">R:R / Risk</span>
                  <span className="mt-1 block font-mono text-xs text-brand-bybit">1:{signal.riskRewardRatio.toFixed(2)} · {signal.riskBps.toFixed(1)} bps</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-trading-border/60 pt-3 text-[10px] text-slate-400">
                <span>Volume {signal.volumeRatio.toFixed(2)}×</span>
                <span>Sweep {signal.sweepDepthBps.toFixed(1)} bps</span>
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="h-3 w-3" /> Cross-cycle protected
                </span>
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> Not executable
                </span>
              </div>

              <div className="mt-3 break-all rounded-lg border border-trading-border bg-dark-bg px-3 py-2 font-mono text-[9px] text-slate-600">
                {signal.signalCandidateKey}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-[10px] leading-relaxed text-slate-400">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
        <span>
          Storage mode: {signalsData?.storage.mode ?? 'ATOMIC_JSON_FILE'}. Render redeploy persistence requires SIGNAL_STORE_PATH to point to a mounted persistent disk. Order placement and execution remain disabled.
        </span>
      </div>
    </div>
  );
}
