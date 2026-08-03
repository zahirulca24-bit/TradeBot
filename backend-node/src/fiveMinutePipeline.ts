import { z } from 'zod';
import type { BybitMarketDataClient } from './marketData.js';
import { postScannerJsonWithRetry } from './scannerRetry.js';
import type { ScannerService } from './scanner.js';

const PYTHON_SCANNER_TIMEOUT_MS = 2000;
const PYTHON_SCANNER_ATTEMPTS = 3;
const FIVE_MINUTE_BATCH_CONCURRENCY = 5;
const FIVE_MINUTE_ENTRY_LIMIT = 3;

type TradingDirection = 'LONG' | 'SHORT';

const entryEngineResponseSchema = z.object({
  engine: z.literal('tradebot-python'),
  strategyStage: z.literal('FIVE_MINUTE_ENTRY'),
  symbol: z.string().regex(/^[A-Z0-9]{3,30}$/),
  interval: z.literal('5'),
  direction: z.enum(['LONG', 'SHORT']),
  passed: z.boolean(),
  indicators: z.object({
    latestClose: z.number().positive(),
    sweepLevel: z.number().positive(),
    averageVolume20: z.number().positive(),
    latestVolume: z.number().positive(),
    volumeRatio: z.number().positive(),
    sweepDepthBps: z.number().nonnegative(),
  }),
  entry: z.object({
    entryCandleCloseTimeMs: z.number().int().positive(),
    entryKey: z.string().regex(/^[A-Z0-9]{3,30}:(LONG|SHORT):\d+$/),
    sweepLookbackCandles: z.literal(20),
    volumeLookbackCandles: z.literal(20),
    volumeMultiplier: z.literal(1.5),
  }),
  candleCount: z.number().int().min(21).max(500),
  latestCandleCloseTimeMs: z.number().int().positive(),
  reasons: z.array(z.string().min(1)).min(1),
  actionable: z.literal(false),
});

type EntryEngineAnalysis = z.infer<typeof entryEngineResponseSchema>;

export interface FiveMinuteEntryResult extends EntryEngineAnalysis {
  source: 'bybit-v5-public';
  scanner: 'tradebot-python';
  stage: 'FIVE_MINUTE_ENTRY';
  status: 'PASSED' | 'REJECTED';
  actionable: false;
}

function failureCode(error: unknown): string {
  return error instanceof Error ? error.message : 'FIVE_MINUTE_ENTRY_FAILED';
}

export class FiveMinutePipelineService {
  public constructor(
    private readonly marketData: BybitMarketDataClient,
    private readonly pythonEngineUrl: string,
    private readonly internalServiceToken: string,
    private readonly upstreamScanner: ScannerService,
  ) {}

  public async analyzeFiveMinuteEntry(
    symbol: string,
    direction: TradingDirection,
  ): Promise<FiveMinuteEntryResult> {
    const requestedSymbol = symbol.toUpperCase();
    const candles = await this.marketData.getClosedCandles(requestedSymbol, '5', 250);

    const result = await postScannerJsonWithRetry({
      url: `${this.pythonEngineUrl}/analysis/entry`,
      internalServiceToken: this.internalServiceToken,
      body: { symbol: requestedSymbol, direction, candles },
      timeoutMs: PYTHON_SCANNER_TIMEOUT_MS,
      attempts: PYTHON_SCANNER_ATTEMPTS,
    });

    const parsed = entryEngineResponseSchema.safeParse(result.payload);
    if (!parsed.success) {
      console.warn('Python entry response contract mismatch', {
        symbol: requestedSymbol,
        direction,
        attempts: result.attempts,
        issues: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
      throw new Error('PYTHON_ENTRY_CONTRACT_MISMATCH');
    }

    const analysis = parsed.data;
    if (analysis.symbol !== requestedSymbol) throw new Error('SCANNER_SYMBOL_MISMATCH');
    if (analysis.direction !== direction) throw new Error('SCANNER_DIRECTION_MISMATCH');
    if (analysis.entry.entryCandleCloseTimeMs !== analysis.latestCandleCloseTimeMs) {
      throw new Error('ENTRY_CANDLE_NOT_LATEST_CLOSED_5M');
    }

    return {
      source: 'bybit-v5-public',
      scanner: 'tradebot-python',
      stage: 'FIVE_MINUTE_ENTRY',
      status: analysis.passed ? 'PASSED' : 'REJECTED',
      ...analysis,
      actionable: false,
    };
  }

  public async scanTopUniverseFiveMinute() {
    const startedAtMs = Date.now();
    const upstream = await this.upstreamScanner.scanTopUniverseFifteenMinute();
    const evaluations: Array<{
      setup: (typeof upstream.fifteenMinute.selected)[number];
      entry: FiveMinuteEntryResult;
    }> = [];
    const failures: Array<{
      setupRank: number;
      symbol: string;
      direction: TradingDirection;
      code: string;
    }> = [];

    for (
      let offset = 0;
      offset < upstream.fifteenMinute.selected.length;
      offset += FIVE_MINUTE_BATCH_CONCURRENCY
    ) {
      const batch = upstream.fifteenMinute.selected.slice(
        offset,
        offset + FIVE_MINUTE_BATCH_CONCURRENCY,
      );
      const batchResults = await Promise.all(
        batch.map(async (setup) => {
          try {
            const entry = await this.analyzeFiveMinuteEntry(setup.symbol, setup.direction);
            if (entry.entry.entryCandleCloseTimeMs < setup.retestCandleCloseTimeMs) {
              throw new Error('ENTRY_PRECEDES_SETUP_RETEST');
            }
            return { ok: true as const, value: { setup, entry } };
          } catch (error) {
            return {
              ok: false as const,
              value: {
                setupRank: setup.setupRank,
                symbol: setup.symbol,
                direction: setup.direction,
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
      .filter((evaluation) => evaluation.entry.passed)
      .sort((left, right) =>
        right.entry.indicators.volumeRatio - left.entry.indicators.volumeRatio ||
        right.entry.indicators.sweepDepthBps - left.entry.indicators.sweepDepthBps ||
        left.setup.setupRank - right.setup.setupRank ||
        left.setup.symbol.localeCompare(right.setup.symbol),
      );

    const uniqueQualified: typeof qualified = [];
    const seenEntryKeys = new Set<string>();
    const duplicates: Array<{
      setupRank: number;
      symbol: string;
      direction: TradingDirection;
      entryKey: string;
      reason: 'DUPLICATE_SYMBOL_DIRECTION_CANDLE_KEY';
    }> = [];

    for (const evaluation of qualified) {
      const key = evaluation.entry.entry.entryKey;
      if (seenEntryKeys.has(key)) {
        duplicates.push({
          setupRank: evaluation.setup.setupRank,
          symbol: evaluation.setup.symbol,
          direction: evaluation.setup.direction,
          entryKey: key,
          reason: 'DUPLICATE_SYMBOL_DIRECTION_CANDLE_KEY',
        });
        continue;
      }
      seenEntryKeys.add(key);
      uniqueQualified.push(evaluation);
    }

    const selected = uniqueQualified.slice(0, FIVE_MINUTE_ENTRY_LIMIT).map((evaluation, index) => ({
      entryRank: index + 1,
      setupRank: evaluation.setup.setupRank,
      oneHourRank: evaluation.setup.oneHourRank,
      universeRank: evaluation.setup.universeRank,
      symbol: evaluation.setup.symbol,
      direction: evaluation.entry.direction,
      trendStrengthBps: evaluation.setup.trendStrengthBps,
      rsi14: evaluation.setup.rsi14,
      breakoutLevel: evaluation.setup.breakoutLevel,
      retestCandleCloseTimeMs: evaluation.setup.retestCandleCloseTimeMs,
      latestClose: evaluation.entry.indicators.latestClose,
      sweepLevel: evaluation.entry.indicators.sweepLevel,
      averageVolume20: evaluation.entry.indicators.averageVolume20,
      latestVolume: evaluation.entry.indicators.latestVolume,
      volumeRatio: evaluation.entry.indicators.volumeRatio,
      sweepDepthBps: evaluation.entry.indicators.sweepDepthBps,
      entryCandleCloseTimeMs: evaluation.entry.entry.entryCandleCloseTimeMs,
      entryKey: evaluation.entry.entry.entryKey,
      reasons: evaluation.entry.reasons,
      actionable: false as const,
    }));

    const rejected = evaluations
      .filter((evaluation) => !evaluation.entry.passed)
      .map((evaluation) => ({
        setupRank: evaluation.setup.setupRank,
        symbol: evaluation.setup.symbol,
        direction: evaluation.entry.direction,
        latestClose: evaluation.entry.indicators.latestClose,
        sweepLevel: evaluation.entry.indicators.sweepLevel,
        volumeRatio: evaluation.entry.indicators.volumeRatio,
        sweepDepthBps: evaluation.entry.indicators.sweepDepthBps,
        entryCandleCloseTimeMs: evaluation.entry.entry.entryCandleCloseTimeMs,
        entryKey: evaluation.entry.entry.entryKey,
        reasons: evaluation.entry.reasons,
      }));

    return {
      source: 'bybit-v5-public',
      scanner: 'tradebot-python',
      pipelineStage: 'TOP_50_TO_ONE_HOUR_20_TO_FIFTEEN_MINUTE_10_TO_FIVE_MINUTE_3',
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      limits: {
        universe: upstream.limits.universe,
        oneHourQualified: upstream.limits.oneHourQualified,
        fifteenMinuteSetups: upstream.limits.fifteenMinuteSetups,
        fiveMinuteEntries: FIVE_MINUTE_ENTRY_LIMIT,
        fiveMinuteConcurrency: FIVE_MINUTE_BATCH_CONCURRENCY,
      },
      universe: upstream.universe,
      oneHour: upstream.oneHour,
      fifteenMinute: upstream.fifteenMinute,
      fiveMinute: {
        requestedCount: upstream.fifteenMinute.selectedCount,
        scannedCount: evaluations.length,
        qualifiedCount: qualified.length,
        uniqueQualifiedCount: uniqueQualified.length,
        selectedCount: selected.length,
        rejectedCount: rejected.length,
        duplicateCount: duplicates.length,
        failedCount: failures.length,
        selected,
        rejected,
        duplicates,
        failures,
      },
      entryFreshnessRule: 'LATEST_CLOSED_5M_CANDLE_MUST_BE_THE_ENTRY_CANDLE',
      duplicatePolicy: 'UNIQUE_SYMBOL_DIRECTION_CANDLE_KEY',
      nextStage: 'RISK_VALIDATION_PENDING',
      actionable: false,
      executionEnabled: false,
    } as const;
  }
}
