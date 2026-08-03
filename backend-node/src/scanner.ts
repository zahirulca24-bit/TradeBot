import { z } from 'zod';
import type { BybitMarketDataClient } from './marketData.js';
import { postScannerJsonWithRetry } from './scannerRetry.js';

const PYTHON_SCANNER_TIMEOUT_MS = 8000;
const PYTHON_SCANNER_ATTEMPTS = 4;

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

export class ScannerService {
  public constructor(
    private readonly marketData: BybitMarketDataClient,
    private readonly pythonEngineUrl: string,
    private readonly internalServiceToken: string,
  ) {}

  public async analyzeOneHourTrend(symbol: string) {
    const requestedSymbol = symbol.toUpperCase();
    const candles = await this.marketData.getClosedCandles(requestedSymbol, '60', 250);

    const result = await postScannerJsonWithRetry({
      url: `${this.pythonEngineUrl}/analysis/trend`,
      internalServiceToken: this.internalServiceToken,
      body: { symbol: requestedSymbol, candles },
      timeoutMs: PYTHON_SCANNER_TIMEOUT_MS,
      attempts: PYTHON_SCANNER_ATTEMPTS,
    });

    const parsed = trendEngineResponseSchema.safeParse(result.payload);
    if (!parsed.success) {
      console.warn('Python scanner response contract mismatch', {
        symbol: requestedSymbol,
        attempts: result.attempts,
        issues: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
      throw new Error('PYTHON_ENGINE_CONTRACT_MISMATCH');
    }

    const analysis = parsed.data;
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
