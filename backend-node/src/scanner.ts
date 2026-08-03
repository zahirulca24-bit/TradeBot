import { z } from 'zod';
import type { BybitMarketDataClient } from './marketData.js';

const trendEngineResponseSchema = z.object({
  engine: z.literal('tradebot-python'),
  strategyStage: z.literal('ONE_HOUR_TREND'),
  symbol: z.string().regex(/^[A-Z0-9]{3,30}$/),
  interval: z.literal('60'),
  direction: z.enum(['LONG', 'SHORT', 'NEUTRAL']),
  passed: z.boolean(),
  indicators: z.object({
    latestClose: z.number().positive(),
    ema20: z.number().positive(),
    ema50: z.number().positive(),
    ema200: z.number().positive(),
  }),
  candleCount: z.number().int().min(200).max(500),
  latestCandleCloseTimeMs: z.number().int().positive(),
  reasons: z.array(z.string().min(1)).min(1),
  actionable: z.literal(false),
});

const engineErrorSchema = z.object({
  detail: z
    .object({
      code: z.string().optional(),
    })
    .optional(),
});

export class ScannerService {
  public constructor(
    private readonly marketData: BybitMarketDataClient,
    private readonly pythonEngineUrl: string,
    private readonly internalServiceToken: string,
  ) {}

  public async analyzeOneHourTrend(symbol: string) {
    const requestedSymbol = symbol.toUpperCase();
    const candles = await this.marketData.getClosedCandles(requestedSymbol, '60', 250);

    const response = await fetch(`${this.pythonEngineUrl}/analysis/trend`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-internal-service-token': this.internalServiceToken,
      },
      body: JSON.stringify({ symbol: requestedSymbol, candles }),
      signal: AbortSignal.timeout(5000),
    });

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) throw new Error('PYTHON_ENGINE_INVALID_RESPONSE');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('PYTHON_ENGINE_INVALID_JSON');
    }

    if (!response.ok) {
      const errorPayload = engineErrorSchema.safeParse(payload);
      const code = errorPayload.success ? errorPayload.data.detail?.code : undefined;
      throw new Error(code || `PYTHON_ENGINE_HTTP_${response.status}`);
    }

    const analysis = trendEngineResponseSchema.parse(payload);
    if (analysis.symbol !== requestedSymbol) throw new Error('SCANNER_SYMBOL_MISMATCH');

    return {
      source: 'bybit-v5-public',
      scanner: 'tradebot-python',
      stage: 'ONE_HOUR_TREND',
      status: analysis.passed ? 'PASSED' : 'REJECTED',
      ...analysis,
      actionable: false,
    } as const;
  }
}
