import { z } from 'zod';

const bybitEnvelopeSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  time: z.number(),
  result: z.unknown(),
});

const serverTimeResultSchema = z.object({
  timeSecond: z.string().regex(/^\d+$/),
  timeNano: z.string().regex(/^\d+$/),
});

const instrumentResultSchema = z.object({
  nextPageCursor: z.string().optional().default(''),
  list: z.array(
    z.object({
      symbol: z.string(),
      status: z.string(),
      quoteCoin: z.string(),
      contractType: z.string(),
      launchTime: z.string(),
      deliveryTime: z.string(),
    }),
  ),
});

const tickerResultSchema = z.object({
  list: z.array(
    z.object({
      symbol: z.string(),
      lastPrice: z.string(),
      volume24h: z.string(),
      turnover24h: z.string(),
      bid1Price: z.string().optional(),
      ask1Price: z.string().optional(),
    }),
  ),
});

const klineResultSchema = z.object({
  symbol: z.string(),
  category: z.string(),
  list: z.array(z.array(z.string()).length(7)),
});

export type SupportedInterval = '5' | '15' | '60';

export interface MarketDataConfig {
  baseUrl: string;
  requestTimeoutMs: number;
  maxClockSkewMs: number;
  maxClosedCandleLagMs: number;
}

export interface ClosedCandle {
  symbol: string;
  interval: SupportedInterval;
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

const intervalMs: Record<SupportedInterval, number> = {
  '5': 5 * 60_000,
  '15': 15 * 60_000,
  '60': 60 * 60_000,
};

function assertFinitePositive(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

export class BybitMarketDataClient {
  public constructor(private readonly config: MarketDataConfig) {}

  private async request(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(path, this.config.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`BYBIT_HTTP_${response.status}`);

    const envelope = bybitEnvelopeSchema.parse(await response.json());
    if (envelope.retCode !== 0) throw new Error(`BYBIT_${envelope.retCode}_${envelope.retMsg}`);
    return envelope;
  }

  public async getServerTimeMs(): Promise<number> {
    const envelope = bybitEnvelopeSchema.parse(await this.request('/v5/market/time'));
    const result = serverTimeResultSchema.parse(envelope.result);
    const serverTimeMs = Number(result.timeSecond) * 1000;
    if (!Number.isSafeInteger(serverTimeMs)) throw new Error('INVALID_BYBIT_SERVER_TIME');
    return serverTimeMs;
  }

  public async assertClockSafe(): Promise<{ serverTimeMs: number; skewMs: number }> {
    const before = Date.now();
    const serverTimeMs = await this.getServerTimeMs();
    const after = Date.now();
    const midpoint = Math.round((before + after) / 2);
    const skewMs = Math.abs(midpoint - serverTimeMs);
    if (skewMs > this.config.maxClockSkewMs) throw new Error('CLOCK_SKEW_UNSAFE');
    return { serverTimeMs, skewMs };
  }

  public async listTradingUsdtPerpetuals(): Promise<string[]> {
    const symbols: string[] = [];
    let cursor = '';
    do {
      const envelope = bybitEnvelopeSchema.parse(
        await this.request('/v5/market/instruments-info', {
          category: 'linear',
          status: 'Trading',
          limit: '1000',
          ...(cursor ? { cursor } : {}),
        }),
      );
      const result = instrumentResultSchema.parse(envelope.result);
      symbols.push(
        ...result.list
          .filter(
            (item) =>
              item.status === 'Trading' &&
              item.quoteCoin === 'USDT' &&
              item.contractType === 'LinearPerpetual',
          )
          .map((item) => item.symbol),
      );
      cursor = result.nextPageCursor;
    } while (cursor);
    return [...new Set(symbols)].sort();
  }

  public async getTickers(symbol?: string) {
    const envelope = bybitEnvelopeSchema.parse(
      await this.request('/v5/market/tickers', {
        category: 'linear',
        ...(symbol ? { symbol: symbol.toUpperCase() } : {}),
      }),
    );
    return tickerResultSchema.parse(envelope.result).list.map((item) => ({
      symbol: item.symbol,
      lastPrice: assertFinitePositive(item.lastPrice, 'last_price'),
      volume24h: assertFinitePositive(item.volume24h, 'volume_24h'),
      turnover24h: assertFinitePositive(item.turnover24h, 'turnover_24h'),
      bid1Price: item.bid1Price ? Number(item.bid1Price) : null,
      ask1Price: item.ask1Price ? Number(item.ask1Price) : null,
    }));
  }

  public async getClosedCandles(
    symbol: string,
    interval: SupportedInterval,
    limit = 200,
  ): Promise<ClosedCandle[]> {
    const receivedAtMs = Date.now();
    const { serverTimeMs } = await this.assertClockSafe();
    const envelope = bybitEnvelopeSchema.parse(
      await this.request('/v5/market/kline', {
        category: 'linear',
        symbol: symbol.toUpperCase(),
        interval,
        limit: String(Math.min(Math.max(limit + 1, 2), 1000)),
      }),
    );
    const result = klineResultSchema.parse(envelope.result);
    const duration = intervalMs[interval];

    const candles = result.list
      .map((row) => {
        const startTimeMs = Number(row[0]);
        const closeTimeMs = startTimeMs + duration;
        return {
          symbol: result.symbol,
          interval,
          startTimeMs,
          closeTimeMs,
          open: assertFinitePositive(row[1], 'open'),
          high: assertFinitePositive(row[2], 'high'),
          low: assertFinitePositive(row[3], 'low'),
          close: assertFinitePositive(row[4], 'close'),
          volume: assertFinitePositive(row[5], 'volume'),
          turnover: assertFinitePositive(row[6], 'turnover'),
          receivedAtMs,
          ageMs: serverTimeMs - closeTimeMs,
        } satisfies ClosedCandle;
      })
      .filter((candle) => candle.closeTimeMs <= serverTimeMs)
      .sort((a, b) => a.startTimeMs - b.startTimeMs);

    if (candles.length === 0) throw new Error('NO_CLOSED_CANDLES');
    const latest = candles.at(-1);
    if (!latest) throw new Error('NO_CLOSED_CANDLES');
    if (latest.ageMs < 0) throw new Error('FUTURE_DATED_CANDLE');
    if (latest.ageMs > duration + this.config.maxClosedCandleLagMs) {
      throw new Error('STALE_MARKET_DATA');
    }
    if (latest.high < latest.low || latest.high < latest.open || latest.high < latest.close) {
      throw new Error('INVALID_CANDLE_RANGE');
    }
    if (latest.low > latest.open || latest.low > latest.close) {
      throw new Error('INVALID_CANDLE_RANGE');
    }

    return candles.slice(-limit);
  }

  public async getFreshnessSnapshot(symbol: string) {
    const [clock, ticker, candles5m, candles15m, candles1h] = await Promise.all([
      this.assertClockSafe(),
      this.getTickers(symbol),
      this.getClosedCandles(symbol, '5', 3),
      this.getClosedCandles(symbol, '15', 3),
      this.getClosedCandles(symbol, '60', 3),
    ]);
    return {
      source: 'bybit-v5-public',
      category: 'linear',
      symbol: symbol.toUpperCase(),
      serverTimeMs: clock.serverTimeMs,
      clockSkewMs: clock.skewMs,
      ticker: ticker[0] ?? null,
      intervals: {
        '5': candles5m.at(-1),
        '15': candles15m.at(-1),
        '60': candles1h.at(-1),
      },
      actionable: true,
    };
  }
}
