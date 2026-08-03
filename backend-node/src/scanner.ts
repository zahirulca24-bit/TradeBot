import { z } from 'zod';
import type { BybitMarketDataClient } from './marketData.js';
import { postScannerJsonWithRetry } from './scannerRetry.js';
import type { UniverseSymbol } from './universe.js';
import { UniverseSelector } from './universe.js';

const PYTHON_SCANNER_TIMEOUT_MS = 2000;
const PYTHON_SCANNER_ATTEMPTS = 3;
const ONE_HOUR_BATCH_CONCURRENCY = 5;
const UNIVERSE_LIMIT = 50;
const QUALIFIED_LIMIT = 20;

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

type TrendEngineAnalysis = z.infer<typeof trendEngineResponseSchema>;

export interface OneHourTrendResult extends TrendEngineAnalysis {
  source: 'bybit-v5-public';
  scanner: 'tradebot-python';
  stage: 'ONE_HOUR_TREND';
  status: 'PASSED' | 'REJECTED';
  actionable: false;
}

interface BatchEvaluation {
  universe: UniverseSymbol;
  trend: OneHourTrendResult;
  trendStrengthBps: number;
}

function calculateTrendStrengthBps(trend: OneHourTrendResult): number {
  if (!trend.passed || trend.direction === 'NEUTRAL') return 0;

  const { latestClose, ema20, ema50, ema200 } = trend.indicators;
  const distance = trend.direction === 'LONG'
    ? (latestClose - ema20) + (ema20 - ema50) + (ema50 - ema200)
    : (ema20 - latestClose) + (ema50 - ema20) + (ema200 - ema50);

  return Number(Math.max(0, (distance / latestClose) * 10_000).toFixed(2));
}

function failureCode(error: unknown): string {
  return error instanceof Error ? error.message : 'ONE_HOUR_SCAN_FAILED';
}

export class ScannerService {
  public constructor(
    private readonly marketData: BybitMarketDataClient,
    private readonly pythonEngineUrl: string,
    private readonly internalServiceToken: string,
    private readonly universeSelector: UniverseSelector,
  ) {}

  public async analyzeOneHourTrend(symbol: string): Promise<OneHourTrendResult> {
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
    };
  }

  public async scanTopUniverseOneHour() {
    const startedAtMs = Date.now();
    const universe = await this.universeSelector.selectTopLiquidUniverse(UNIVERSE_LIMIT);
    const evaluations: BatchEvaluation[] = [];
    const failures: Array<{
      universeRank: number;
      symbol: string;
      code: string;
    }> = [];

    for (let offset = 0; offset < universe.symbols.length; offset += ONE_HOUR_BATCH_CONCURRENCY) {
      const batch = universe.symbols.slice(offset, offset + ONE_HOUR_BATCH_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (universeSymbol) => {
          try {
            const trend = await this.analyzeOneHourTrend(universeSymbol.symbol);
            return {
              ok: true as const,
              value: {
                universe: universeSymbol,
                trend,
                trendStrengthBps: calculateTrendStrengthBps(trend),
              },
            };
          } catch (error) {
            return {
              ok: false as const,
              value: {
                universeRank: universeSymbol.rank,
                symbol: universeSymbol.symbol,
                code: failureCode(error),
              },
            };
          }
        }),
      );

      for (const result of batchResults) {
        if (result.ok) evaluations.push(result.value);
        else failures.push(result.value);
      }
    }

    const qualified = evaluations
      .filter((evaluation) => evaluation.trend.passed && evaluation.trend.direction !== 'NEUTRAL')
      .sort((left, right) =>
        right.trendStrengthBps - left.trendStrengthBps ||
        left.universe.rank - right.universe.rank ||
        left.universe.symbol.localeCompare(right.universe.symbol),
      );

    const selected = qualified.slice(0, QUALIFIED_LIMIT).map((evaluation, index) => ({
      selectionRank: index + 1,
      universeRank: evaluation.universe.rank,
      symbol: evaluation.universe.symbol,
      direction: evaluation.trend.direction,
      trendStrengthBps: evaluation.trendStrengthBps,
      turnover24h: evaluation.universe.turnover24h,
      volume24h: evaluation.universe.volume24h,
      spreadBps: evaluation.universe.spreadBps,
      latestClose: evaluation.trend.indicators.latestClose,
      ema20: evaluation.trend.indicators.ema20,
      ema50: evaluation.trend.indicators.ema50,
      ema200: evaluation.trend.indicators.ema200,
      latestCandleCloseTimeMs: evaluation.trend.latestCandleCloseTimeMs,
      reasons: evaluation.trend.reasons,
      actionable: false as const,
    }));

    const rejected = evaluations
      .filter((evaluation) => !evaluation.trend.passed)
      .map((evaluation) => ({
        universeRank: evaluation.universe.rank,
        symbol: evaluation.universe.symbol,
        direction: evaluation.trend.direction,
        reasons: evaluation.trend.reasons,
      }));

    return {
      source: 'bybit-v5-public',
      scanner: 'tradebot-python',
      pipelineStage: 'TOP_50_TO_ONE_HOUR_20',
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      limits: {
        universe: UNIVERSE_LIMIT,
        oneHourQualified: QUALIFIED_LIMIT,
        concurrency: ONE_HOUR_BATCH_CONCURRENCY,
      },
      universe,
      oneHour: {
        requestedCount: universe.selectedCount,
        scannedCount: evaluations.length,
        qualifiedCount: qualified.length,
        selectedCount: selected.length,
        rejectedCount: rejected.length,
        failedCount: failures.length,
        selected,
        rejected,
        failures,
      },
      nextStage: 'FIFTEEN_MINUTE_SETUP_PENDING',
      actionable: false,
      executionEnabled: false,
    } as const;
  }
}
