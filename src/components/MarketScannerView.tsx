import React from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
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

const REQUEST_TIMEOUT_MS = 15000;

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
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

function formatTimestamp(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Date(value).toLocaleString();
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
  const [loading, setLoading] = React.useState(true);
  const [trendLoading, setTrendLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [trendError, setTrendError] = React.useState<string | null>(null);
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
      setSymbols(null);
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
      const trendResult = await requestJson<OneHourTrendResponse>(
        `${apiBaseUrl}/api/scanner/trend/${encodeURIComponent(selectedSymbol)}`,
      );
      setTrend(trendResult);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'ONE_HOUR_TREND_LOAD_FAILED';
      setTrend(null);
      setTrendError(message);
    } finally {
      setTrendLoading(false);
    }
  }, [apiBaseUrl, selectedSymbol]);

  React.useEffect(() => {
    void loadMarketData();
    void loadTrendData();
  }, [loadMarketData, loadTrendData]);

  const liveTicker = ticker?.tickers[0] ?? freshness?.ticker ?? null;
  const online = symbols?.actionable === true && freshness?.actionable === true;
  const refreshing = loading || trendLoading;

  const handleRefresh = () => {
    if (!apiBaseUrl) {
      onTriggerNoBackendWarning('VITE_API_BASE_URL is not configured');
      return;
    }
    void loadMarketData();
    void loadTrendData();
  };

  const intervals = [
    ['5M', freshness?.intervals['5']],
    ['15M', freshness?.intervals['15']],
    ['1H', freshness?.intervals['60']],
  ] as const;

  const directionClass =
    trend?.direction === 'LONG'
      ? 'bg-emerald-500/10 text-emerald-400'
      : trend?.direction === 'SHORT'
        ? 'bg-rose-500/10 text-rose-400'
        : 'bg-amber-500/10 text-amber-300';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-trading-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <Search className="h-5 w-5 text-brand-bybit" /> Market Scanner
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Live Bybit market data with deterministic 1H trend analysis. Signals and execution remain disabled.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-trading-border bg-card-bg px-3 py-2 text-xs">
            <span className="mr-2 text-slate-500">Data Link:</span>
            <span className={online ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
              {loading ? 'CHECKING' : online ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="rounded-lg border border-trading-border bg-card-bg px-3 py-2 text-xs">
            <span className="mr-2 text-slate-500">1H Trend:</span>
            <span
              className={
                trendLoading
                  ? 'font-semibold text-amber-300'
                  : trend
                    ? trend.passed
                      ? 'font-semibold text-emerald-400'
                      : 'font-semibold text-rose-400'
                    : 'font-semibold text-rose-400'
              }
            >
              {trendLoading ? 'ANALYZING' : trend?.status ?? 'OFFLINE'}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-bybit px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
          >
            {refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Refresh Scanner
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          Market data unavailable: <span className="font-mono">{error}</span>. No fallback data is shown.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-trading-border bg-card-bg p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Database className="h-4 w-4" /> Trading Symbols</div>
          <p className="mt-3 font-mono text-2xl font-bold text-slate-100">{symbols?.count ?? 0}</p>
          <p className="mt-1 text-[10px] text-slate-500">USDT linear perpetuals</p>
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
          <p className="mt-1 text-[10px] text-slate-500">Live backend response</p>
        </div>
      </div>

      <div className="rounded-xl border border-trading-border bg-card-bg p-5">
        <div className="flex flex-col gap-3 border-b border-trading-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Market Data Snapshot</h3>
            <p className="mt-1 text-[11px] text-slate-500">Closed-candle freshness for the selected symbol.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500" htmlFor="market-symbol">Symbol</label>
            <select
              id="market-symbol"
              value={selectedSymbol}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setSelectedSymbol(event.target.value)}
              className="rounded-lg border border-trading-border bg-dark-bg px-3 py-2 text-xs font-mono text-slate-200"
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
              <Activity className="h-4 w-4 text-brand-bybit" /> 1H Trend Scanner
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">EMA20 / EMA50 / EMA200 classification from 250 validated closed 1H candles.</p>
          </div>
          {trend && (
            <div className="flex items-center gap-2">
              <span className={`rounded px-2.5 py-1 text-xs font-bold ${directionClass}`}>{trend.direction}</span>
              <span className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-bold ${trend.passed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                {trend.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {trend.status}
              </span>
            </div>
          )}
        </div>

        {trendError && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            1H trend analysis unavailable: <span className="font-mono">{trendError}</span>. Market data remains visible, but no trend result is fabricated.
          </div>
        )}

        {trendLoading && !trend && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Analyzing validated 1H candles…
          </div>
        )}

        {!trendLoading && !trend && !trendError && (
          <div className="py-10 text-center text-xs text-slate-500">No 1H trend result available.</div>
        )}

        {trend && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Direction</span>
                <p className={`mt-2 inline-flex rounded px-2 py-1 font-mono text-sm font-bold ${directionClass}`}>{trend.direction}</p>
              </div>
              <div className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Stage Status</span>
                <p className={`mt-2 font-mono text-sm font-bold ${trend.passed ? 'text-emerald-400' : 'text-rose-400'}`}>{trend.status}</p>
              </div>
              <div className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Latest Close</span>
                <p className="mt-2 font-mono text-sm font-bold text-slate-200">{formatNumber(trend.indicators.latestClose, 4)}</p>
              </div>
              <div className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Candles Used</span>
                <p className="mt-2 font-mono text-sm font-bold text-slate-200">{trend.candleCount}</p>
              </div>
              <div className="rounded-lg border border-trading-border bg-dark-bg/50 p-3">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Closed At</span>
                <p className="mt-2 text-xs font-semibold text-slate-200">{formatTimestamp(trend.latestCandleCloseTimeMs)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['EMA20', trend.indicators.ema20],
                ['EMA50', trend.indicators.ema50],
                ['EMA200', trend.indicators.ema200],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-trading-border bg-dark-bg/50 p-4">
                  <span className="text-xs text-slate-500">{label}</span>
                  <p className="mt-2 font-mono text-lg font-bold text-slate-100">{formatNumber(value as number, 4)}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-trading-border bg-dark-bg/50 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Decision Reasons</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {trend.reasons.map((reason) => (
                  <span key={reason} className="rounded border border-trading-border bg-card-bg px-2.5 py-1 font-mono text-[11px] text-slate-300">
                    {reason}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
              Analysis only: this stage is intentionally non-actionable and cannot create signals or place orders.
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200">
        <div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>Live market data and the 1H trend stage are connected. Symbol filtering, 15M setup, 5M confirmation, grading, signals, and execution remain outside this phase.</p></div>
      </div>
    </div>
  );
}
