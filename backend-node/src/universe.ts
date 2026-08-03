import { z } from 'zod';
import type { BybitMarketDataClient } from './marketData.js';

const bybitEnvelopeSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.unknown(),
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

export interface UniverseSelectorConfig {
  baseUrl: string;
  requestTimeoutMs: number;
  maxSpreadBps: number;
}

export interface UniverseSymbol {
  rank: number;
  symbol: string;
  lastPrice: number;
  volume24h: number;
  turnover24h: number;
  bid1Price: number;
  ask1Price: number;
  spreadBps: number;
}

function positiveNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export class UniverseSelector {
  public constructor(
    private readonly marketData: BybitMarketDataClient,
    private readonly config: UniverseSelectorConfig,
  ) {}

  private async getLinearTickers(): Promise<z.infer<typeof tickerResultSchema>['list']> {
    const url = new URL('/v5/market/tickers', this.config.baseUrl);
    url.searchParams.set('category', 'linear');

    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`BYBIT_TICKERS_HTTP_${response.status}`);

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) throw new Error('BYBIT_TICKERS_INVALID_RESPONSE');

    const payload = await response.json().catch(() => null);
    if (payload === null) throw new Error('BYBIT_TICKERS_INVALID_JSON');

    const envelope = bybitEnvelopeSchema.parse(payload);
    if (envelope.retCode !== 0) {
      throw new Error(`BYBIT_${envelope.retCode}_${envelope.retMsg}`);
    }
    return tickerResultSchema.parse(envelope.result).list;
  }

  public async selectTopLiquidUniverse(limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const [tradingSymbols, rawTickers] = await Promise.all([
      this.marketData.listTradingUsdtPerpetuals(),
      this.getLinearTickers(),
    ]);
    const tradingSet = new Set(tradingSymbols);

    let invalidTickerCount = 0;
    let wideSpreadCount = 0;

    const eligible = rawTickers.flatMap((ticker) => {
      if (!tradingSet.has(ticker.symbol)) return [];

      const lastPrice = positiveNumber(ticker.lastPrice);
      const volume24h = positiveNumber(ticker.volume24h);
      const turnover24h = positiveNumber(ticker.turnover24h);
      const bid1Price = positiveNumber(ticker.bid1Price);
      const ask1Price = positiveNumber(ticker.ask1Price);

      if (
        lastPrice === null ||
        volume24h === null ||
        turnover24h === null ||
        bid1Price === null ||
        ask1Price === null ||
        bid1Price > ask1Price
      ) {
        invalidTickerCount += 1;
        return [];
      }

      const midpoint = (bid1Price + ask1Price) / 2;
      const spreadBps = ((ask1Price - bid1Price) / midpoint) * 10_000;
      if (!Number.isFinite(spreadBps) || spreadBps > this.config.maxSpreadBps) {
        wideSpreadCount += 1;
        return [];
      }

      return [{
        rank: 0,
        symbol: ticker.symbol,
        lastPrice,
        volume24h,
        turnover24h,
        bid1Price,
        ask1Price,
        spreadBps: Number(spreadBps.toFixed(4)),
      } satisfies UniverseSymbol];
    });

    eligible.sort((left, right) =>
      right.turnover24h - left.turnover24h ||
      right.volume24h - left.volume24h ||
      left.spreadBps - right.spreadBps ||
      left.symbol.localeCompare(right.symbol),
    );

    const symbols = eligible.slice(0, safeLimit).map((item, index) => ({
      ...item,
      rank: index + 1,
    }));

    return {
      source: 'bybit-v5-public',
      method: 'TURNOVER_VOLUME_SPREAD',
      requestedLimit: safeLimit,
      tradingSymbolCount: tradingSymbols.length,
      eligibleCount: eligible.length,
      invalidTickerCount,
      wideSpreadCount,
      maxSpreadBps: this.config.maxSpreadBps,
      selectedCount: symbols.length,
      symbols,
      actionable: false,
    } as const;
  }
}
