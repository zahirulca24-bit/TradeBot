import React from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Filter,
  Play,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';

interface MarketScannerViewProps {
  apiBaseUrl: string;
  onTriggerNoBackendWarning: (message: string) => void;
}

interface SymbolsResponse {
  source: string;
  category: string;
  quoteCoin: string;
  count: number;
  symbols: string[];
  actionable: boolean;
}

interface Ticker {
  symbol: string;
  lastPrice: number;
  volume24h: number;
  turnover24h: number;
  bid1Price: number | null;
  ask1Price: number | null;
}

interface TickerResponse {
  source: string;
  category: string;
  count: number;
  tickers: Ticker[];
  actionable: boolean;
}

interface ClosedCandle {
  symbol: string;
  interval: '5' | '15' | '60';
  startTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  receivedAtMs: number;
  ageMs: number;
}

interface FreshnessResponse {
  source: string;
  category: string;
  symbol: string;
  serverTimeMs: number;
  clockSkewMs: number;
  ticker: Ticker | null;
  intervals: {
    '5': ClosedCandle | null;
    '15': ClosedCandle | null;
    '60': ClosedCandle | null;
  };
  actionable: boolean;
}

interface OneHourTrendResponse {
  source: string;
  scanner: 'tradebot-python';
  stage: 'ONE_HOUR_TREND';
  status: 'PASSED' | 'REJECTED';
  engine: 'tradebot-python';
  strategyStage: 'ONE_HOUR_TREND';
  symbol: string;
  interval: '60';
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  passed: boolean;
  indicators: {
    latestClose: number;
    ema20: number;
    ema50: number;
    ema200: number;
  };
  candleCount: number;
  latestCandleCloseTimeMs: number;
  reasons: string[];
  actionable: false;
}

interface UniverseSymbol {
  rank: number;
  symbol: string;
  lastPrice: number;
  volume24h: number;
  turnover24h: number;
  bid1Price: number;
  ask1Price: number;
  spreadBps: number;
}

interface BatchSelectedSymbol {
  selectionRank: number;
  universeRank: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  trendStrengthBps: number;
  turnover24h: number;
  volume24h: number;
  spreadBps: number;
  latestClose: number;
  ema20: number;
  ema50: number;
  ema200: number;
  latestCandleCloseTimeMs: number;
  reasons: string[];
  actionable: false;
}

interface OneHourBatchResponse {
  source: string;
  scanner: string;
  pipelineStage: 'TOP_50_TO_ONE_HOUR_20';
  generatedAt: string;
  durationMs: number;
  limits: {
    universe: 50;
    oneHourQualified: 20;
    concurrency: number;
  };
  universe: {
    method: string;
    requestedLimit: number;
    tradingSymbolCount: number;
    eligibleCount: number;
    invalidTickerCount: number;
    wideSpreadCount: number;
    maxSpreadBps: number;
    selectedCount: number;
    symbols: UniverseSymbol[];
  };
  oneHour: {
    requestedCount: number;
    scannedCount: number;
    qualifiedCount: number;
    selectedCount: number;
    rejectedCount: number;
    failedCount: number;
    selected: BatchSelectedSymbol[];
    rejected: Array<{
      universeRank: number;
      symbol: string;
      direction: 'NEUTRAL';
      reasons: string[];
    }>;
    failures: Array<{
      universeRank: number;
      symbol: string;
      code: string;
    }>;
  };
  nextStage: string;
  actionable: false;
  executionEnabled: false;
}

const SINGLE_REQUEST_TIMEOUT_MS = 15000;
const BATCH_REQUEST_TIMEOUT_MS = 120000;

async function requestJson<T>(url: string, timeoutMs = SINGLE_REQUEST_TIMEOUT_MS): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
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

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}

function formatTimestamp(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Date(value).toLocaleString();
}

function directionClass(direction: 'LONG' | 'SHORT' | 'NEUTRAL' | undefined) {
  if (direction === 'LONG') return 'bg-emerald-500/10 text-emerald-400';
  if (direction === 'SHORT') return 'bg-rose-500/10 text-rose-400';
  return 'bg-amber-500/10 text-amber-300';
}

export default function MarketScannerView({
  apiBaseUrl,
  onTriggerNoBackendWarning,
}: MarketScannerViewProps) {
  const [selectedSymbol, setSelectedSymbol] = React.useState('BTCUSDT');
  const [symbols, setSymbols] = React.useState<SymbolsResponse | null>(null);
  const [ticker, setTicker] = React.useState<TickerResponse | null>(null);
  const [freshness, setFreshness] = React.useState<FreshnessResponse | null>(null);
  const [trend, setTrend] = React.useState<OneHourTrendResponse | null>(null);
  const [batchScan, setBatchScan] = React.useState<OneHourBatchResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [trendLoading, setTrendLoading] = React.useState(true);
  const [batchLoading, setBatchLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [trendError, setTrendError] = React.useState<string | null>(null);
  const [batchError, setBatchError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const loadMarketData = React.useCallback(async () => {
    if (!apiBaseUrl) {
      setError('VITE_API_BASE_URL_NOT_CONFIGURED');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [symbolsResult, tickerResult, freshnessResult] = await Promise.all([
        requestJson<SymbolsResponse>(`${apiBaseUrl}/api/market/symbols`),
        requestJson<TickerResponse>(
          `${apiBaseUrl}/api/market/tickers?symbol=${encodeURIComponent(selectedSymbol)}`,
        ),
        requestJson<FreshnessResponse>(
          `${apiBaseUrl}/api/market/freshness/${encodeURIComponent(selectedSymbol)}`,
        ),
      ]);
      setSymbols(symbolsResult);
      setTicker(tickerResult);
      setFreshness(freshnessResult);
      setLastUpdated(new Date());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'MARKET_DATA_LOAD_FAILED';
      setTicker(null);
      setFreshness(null);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, selectedSymbol]);

  const loadTrendData = React.useCallback(async () => {
    if (!apiBaseUrl) {
      setTrendError('VITE_API_BASE_URL_NOT_CONFIGURED');
      setTrendLoading(false);
      return;
    }

    setTrendLoading(true);
    setTrendError(null);
    try {
      const result = await requestJson<OneHourTrendResponse>(
        `${apiBaseUrl}/api/scanner/trend/${encodeURIComponent(selectedSymbol)}`,
      );
      setTrend(result);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'ONE_HOUR_TREND_LOAD_FAILED';
      setTrend(null);
      setTrendError(message);
    } finally {
      setTrendLoading(false);
    }
  }, [apiBaseUrl, selectedSymbol]);

  const runBatchScan = async () => {
    if (!apiBaseUrl) {
      onTriggerNoBackendWarning('VITE_API_BASE_URL is not configured');
      return;
    }

    setBatchLoading(true);
    setBatchError(null);
    try {
      const result = await requestJson<OneHourBatchResponse>(
        `${apiBaseUrl}/api/scanner/batch/one-hour`,
        BATCH_REQUEST_TIMEOUT_MS,
      );
      setBatchScan(result);
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : 'ONE_HOUR_BATCH_SCAN_FAILED';
      setBatchScan(null);
      setBatchError(message);
    } finally {
      setBatchLoading(false);
    }
  };

  React.useEffect(() => {
    void loadMarketData();
    void loadTrendData();
  }, [loadMarketData, loadTrendData]);

  const liveTicker = ticker?.tickers[0] ?? freshness?.ticker ?? null;
  const online = symbols?.actionable === true && freshness?.actionable === true;
  const refreshing = loading || trendLoading;
  const intervals = [
    ['5M', freshness?.intervals['5']],
    ['15M', freshness?.intervals['15']],
    ['1H', freshness?.intervals['60']],
  ] as const;

  const handleRefresh = () => {
    if (!apiBaseUrl) {
      onTriggerNoBackendWarning('VITE_API_BASE_URL is not configured');
      return;
    }
    void loadMarketData();
    void loadTrendData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-trading-border pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <Search className="h-5 w-5 text-brand-bybit" /> Market Scanner
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Live Bybit universe selection and deterministic closed-candle 1H trend filtering. Signals and execution remain disabled.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-trading-border bg-card-bg px-3 py-2 text-xs">
            <span className="mr-2 text-slate-500">Data Link:</span>
            <span className={online ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
              {loading ? 'CHECKING' : online ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <button
            onClick={() => void runBatchScan()}
            disabled={batchLoading || !apiBaseUrl}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-bybit/40 bg-brand-bybit/10 px-4 py-2 text-xs font-semibold text-brand-bybit disabled:opacity-50"
          >
            {batchLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Filter className="h-3.5 w-3.5" />}
            {batchLoading ? 'Scanning 50 Symbols…' : 'Run 50 → 20 Batch'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-bybit px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
          >
            {refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Refresh Symbol
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          Market data unavailable: <span className="font-mono">{error}</span>. No fallback data is shown.
        </div>
      )}

      {batchError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          Top-50 batch scan failed: <span className="font-mono">{batchError}</span>. No symbol is promoted to the next stage.
        </div>
      )}

      <div className="rounded-xl border border-brand-bybit/20 bg-card-bg p-5 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-trading-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Filter className="h-4 w-4 text-brand-bybit" /> Pipeline Stage: Top 50 → Maximum 20
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              Trading USDT perpetuals are ranked by 24H turnover, volume and spread, then scanned through the existing 1H EMA engine.
            </p>
          </div>
          <span className="rounded border border-trading-border bg-dark-bg px-2.5 py-1 font-mono text-[10px] text-slate-400">
            15M SETUP: PENDING
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Trading Market', batchScan?.universe.tradingSymbolCount ?? symbols?.count ?? 0],
            ['Top Universe', batchScan?.universe.selectedCount ?? 0],
            ['1H Scanned', batchScan?.oneHour.scannedCount ?? 0],
            ['1H Qualified', batchScan?.oneHour.qualifiedCount ?? 0],
            ['Selected Max 20', batchScan?.oneHour.selectedCount ?? 0],
            ['Failed', batchScan?.oneHour.failedCount ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
              <p className="mt-2 font-mono text-xl font-bold text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        {!batchScan && !batchLoading && !batchError && (
          <div className="mt-4 rounded-lg border border-dashed border-trading-border p-8 text-center text-xs text-slate-500">
            Run the batch scanner to create the live Top-50 universe and produce up to 20 valid 1H LONG/SHORT candidates.
          </div>
        )}

        {batchLoading && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-trading-border bg-dark-bg/40 py-10 text-xs text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Ranking market liquidity and scanning 250 closed 1H candles per symbol…
          </div>
        )}

        {batchScan && !batchLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                Completed in {formatNumber(batchScan.durationMs / 1000, 1)} sec · Spread cap {batchScan.universe.maxSpreadBps} bps · Concurrency {batchScan.limits.concurrency}
              </span>
              <span>{new Date(batchScan.generatedAt).toLocaleString()}</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-trading-border">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-dark-bg/80 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Symbol</th>
                    <th className="px-3 py-3">1H Direction</th>
                    <th className="px-3 py-3 text-right">Strength</th>
                    <th className="px-3 py-3 text-right">24H Turnover</th>
                    <th className="px-3 py-3 text-right">Spread</th>
                    <th className="px-3 py-3 text-right">Close</th>
                    <th className="px-3 py-3">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {batchScan.oneHour.selected.map((item) => (
                    <tr key={item.symbol} className="border-t border-trading-border/70 text-slate-300">
                      <td className="px-3 py-3 font-mono text-slate-500">{item.selectionRank}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedSymbol(item.symbol)}
                          className="font-mono font-bold text-slate-100 hover:text-brand-bybit"
                        >
                          {item.symbol}
                        </button>
                        <span className="ml-2 text-[10px] text-slate-600">U#{item.universeRank}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded px-2 py-1 font-mono text-[10px] font-bold ${directionClass(item.direction)}`}>
                          {item.direction}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">{formatNumber(item.trendStrengthBps, 2)} bps</td>
                      <td className="px-3 py-3 text-right font-mono">{formatCompact(item.turnover24h)}</td>
                      <td className="px-3 py-3 text-right font-mono">{formatNumber(item.spreadBps, 2)} bps</td>
                      <td className="px-3 py-3 text-right font-mono">{formatNumber(item.latestClose, 4)}</td>
                      <td className="px-3 py-3 text-[10px] font-semibold text-amber-300">15M PENDING</td>
                    </tr>
                  ))}
                  {batchScan.oneHour.selected.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                        No symbol passed the strict 1H LONG/SHORT rules. The scanner did not fill the quota artificially.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {batchScan.oneHour.failures.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Failed symbols</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {batchScan.oneHour.failures.map((failure) => (
                    <span key={`${failure.symbol}-${failure.code}`} className="rounded border border-amber-500/20 px-2 py-1 font-mono text-[10px] text-amber-200">
                      {failure.symbol}: {failure.code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-trading-border bg-card-bg p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Database className="h-4 w-4" /> Trading Symbols</div>
          <p className="mt-3 font-mono text-2xl font-bold text-slate-100">{symbols?.count ?? 0}</p>
          <p className="mt-1 text-[10px] text-slate-500">Full Bybit USDT market</p>
        </div>
        <div className="rounded-xl border border-trading-border bg-card-bg p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Database className="h-4 w-4" /> {selectedSymbol} Price</div>
          <p className="mt-3 font-mono text-2xl font-bold text-slate-100">{formatNumber(liveTicker?.lastPrice, 4)}</p>
          <p className="mt-1 text-[10px] text-slate-500">Bid {formatNumber(liveTicker?.bid1Price, 4)} / Ask {formatNumber(liveTicker?.ask1Price, 4)}</p>
        </div>
        <div className="rounded-xl border border-trading-border bg-card-bg p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Clock className="h-4 w-4" /> Clock Skew</div>
          <p className="mt-3 font-mono text-2xl font-bold text-slate-100">{freshness?.clockSkewMs ?? '—'} ms</p>
          <p className="mt-1 text-[10px] text-slate-500">Maximum configured: 3000 ms</p>
        </div>
        <div className="rounded-xl border border-trading-border bg-card-bg p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Clock className="h-4 w-4" /> Last Updated</div>
          <p className="mt-3 font-mono text-sm font-bold text-slate-100">{lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}</p>
          <p className="mt-1 text-[10px] text-slate-500">Selected-symbol response</p>
        </div>
      </div>

      <div className="rounded-xl border border-trading-border bg-card-bg p-5">
        <div className="flex flex-col gap-3 border-b border-trading-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Selected Symbol Snapshot</h3>
            <p className="mt-1 text-[11px] text-slate-500">Closed-candle freshness and individual 1H audit.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500" htmlFor="market-symbol">Symbol</label>
            <select
              id="market-symbol"
              value={selectedSymbol}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSelectedSymbol(event.target.value)}
              className="max-w-48 rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs font-mono text-slate-200"
            >
              {(symbols?.symbols?.length ? symbols.symbols : [selectedSymbol]).map((symbol) => (
                <option key={symbol} value={symbol}>{symbol}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {intervals.map(([label, candle]) => (
            <div key={label} className="rounded-lg border border-trading-border bg-dark-bg/50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">{label}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${candle ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {candle ? 'FRESH' : 'NO DATA'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <span className="text-slate-500">Open</span><span className="text-right font-mono text-slate-300">{formatNumber(candle?.open, 4)}</span>
                <span className="text-slate-500">High</span><span className="text-right font-mono text-slate-300">{formatNumber(candle?.high, 4)}</span>
                <span className="text-slate-500">Low</span><span className="text-right font-mono text-slate-300">{formatNumber(candle?.low, 4)}</span>
                <span className="text-slate-500">Close</span><span className="text-right font-mono text-slate-300">{formatNumber(candle?.close, 4)}</span>
                <span className="text-slate-500">Age</span><span className="text-right font-mono text-slate-300">{candle ? `${Math.round(candle.ageMs / 1000)} sec` : '—'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-trading-border bg-card-bg p-5">
        <div className="flex flex-col gap-3 border-b border-trading-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Activity className="h-4 w-4 text-brand-bybit" /> Individual 1H Trend Audit
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">EMA20 / EMA50 / EMA200 from 250 validated closed 1H candles.</p>
          </div>
          {trend && (
            <div className="flex items-center gap-2">
              <span className={`rounded px-2.5 py-1 text-xs font-bold ${directionClass(trend.direction)}`}>{trend.direction}</span>
              <span className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-bold ${trend.passed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                {trend.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {trend.status}
              </span>
            </div>
          )}
        </div>

        {trendError && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            1H trend analysis unavailable: <span className="font-mono">{trendError}</span>. No trend is fabricated.
          </div>
        )}

        {trendLoading && !trend && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Analyzing validated 1H candles…
          </div>
        )}

        {trend && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ['Latest Close', trend.indicators.latestClose],
                ['EMA20', trend.indicators.ema20],
                ['EMA50', trend.indicators.ema50],
                ['EMA200', trend.indicators.ema200],
                ['Candles', trend.candleCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
                  <p className="mt-2 font-mono text-sm font-bold text-slate-200">{formatNumber(value as number, label === 'Candles' ? 0 : 4)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-trading-border bg-dark-bg/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Decision Reasons</h4>
                <span className="text-[10px] text-slate-500">Closed {formatTimestamp(trend.latestCandleCloseTimeMs)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {trend.reasons.map((reason) => (
                  <span key={reason} className="rounded border border-trading-border bg-card-bg px-2.5 py-1 font-mono text-[11px] text-slate-300">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200">
        <div className="flex gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Current live pipeline: Top 50 liquidity universe → maximum 20 strict 1H candidates. The 15M setup, 5M entry, risk validation, signals and execution are not enabled yet.
          </p>
        </div>
      </div>
    </div>
  );
}
