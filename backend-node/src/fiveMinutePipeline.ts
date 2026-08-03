import { z } from 'zod';
import type { BybitMarketDataClient } from './marketData.js';
import { postScannerJsonWithRetry } from './scannerRetry.js';
import type { ScannerService } from './scanner.js';

const PYTHON_SCANNER_TIMEOUT_MS = 2000;
const PYTHON_SCANNER_ATTEMPTS = 3;
const FIVE_MINUTE_BATCH_CONCURRENCY = 5;
const RISK_BATCH_CONCURRENCY = 3;
const FIVE_MINUTE_ENTRY_LIMIT = 3;
const FINAL_CANDIDATE_LIMIT = 3;

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

const riskEngineResponseSchema = z.object({
  engine: z.literal('tradebot-python'),
  strategyStage: z.literal('FINAL_RISK_CANDIDATE'),
  symbol: z.string().regex(/^[A-Z0-9]{3,30}$/),
  interval: z.literal('15'),
  direction: z.enum(['LONG', 'SHORT']),
  passed: z.boolean(),
  entry: z.object({
    entryPrice: z.number().positive(),
    entryCandleCloseTimeMs: z.number().int().positive(),
    entryKey: z.string().regex(/^[A-Z0-9]{3,30}:(LONG|SHORT):\d+$/),
  }),
  risk: z.object({
    stopLoss: z.number().positive().nullable(),
    targetPrice: z.number().positive().nullable(),
    riskDistance: z.number().positive().nullable(),
    riskBps: z.number().positive().nullable(),
    riskRewardRatio: z.number().positive().nullable(),
    minimumRiskRewardRatio: z.literal(2),
    swingPrice: z.number().positive().nullable(),
    swingCandleCloseTimeMs: z.number().int().positive().nullable(),
    swingAgeCandles: z.number().int().min(1).nullable(),
    swingLookbackCandles: z.literal(40),
    pivotLeftCandles: z.literal(1),
    pivotRightCandles: z.literal(1),
  }),
  candleCount: z.number().int().min(5).max(500),
  latestCandleCloseTimeMs: z.number().int().positive(),
  signalCandidateKey: z.string().min(1).nullable(),
  reasons: z.array(z.string().min(1)).min(1),
  actionable: z.literal(false),
});

type EntryEngineAnalysis = z.infer<typeof entryEngineResponseSchema>;
type RiskEngineAnalysis = z.infer<typeof riskEngineResponseSchema>;

export interface FiveMinuteEntryResult extends EntryEngineAnalysis {
  source: 'bybit-v5-public';
  scanner: 'tradebot-python';
  stage: 'FIVE_MINUTE_ENTRY';
  status: 'PASSED' | 'REJECTED';
  actionable: false;
}

export interface FinalRiskCandidateResult extends RiskEngineAnalysis {
  source: 'bybit-v5-public';
  scanner: 'tradebot-python';
  stage: 'FINAL_RISK_CANDIDATE';
  status: 'PASSED' | 'REJECTED';
  actionable: false;
}

function failureCode(error: unknown, fallback = 'FIVE_MINUTE_ENTRY_FAILED'): string {
  return error instanceof Error ? error.message : fallback;
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

  public async analyzeFinalRiskCandidate(
    symbol: string,
    direction: TradingDirection,
    entryPrice: number,
    entryCandleCloseTimeMs: number,
    entryKey: string,
  ): Promise<FinalRiskCandidateResult> {
    const requestedSymbol = symbol.toUpperCase();
    const candles = await this.marketData.getClosedCandles(requestedSymbol, '15', 250);

    const result = await postScannerJsonWithRetry({
      url: `${this.pythonEngineUrl}/analysis/risk`,
      internalServiceToken: this.internalServiceToken,
      body: {
        symbol: requestedSymbol,
        direction,
        entryPrice,
        entryCandleCloseTimeMs,
        entryKey,
        candles,
      },
      timeoutMs: PYTHON_SCANNER_TIMEOUT_MS,
      attempts: PYTHON_SCANNER_ATTEMPTS,
    });

    const parsed = riskEngineResponseSchema.safeParse(result.payload);
    if (!parsed.success) {
      console.warn('Python risk response contract mismatch', {
        symbol: requestedSymbol,
        direction,
        attempts: result.attempts,
        issues: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
      throw new Error('PYTHON_RISK_CONTRACT_MISMATCH');
    }

    const analysis = parsed.data;
    if (analysis.symbol !== requestedSymbol) throw new Error('RISK_SYMBOL_MISMATCH');
    if (analysis.direction !== direction) throw new Error('RISK_DIRECTION_MISMATCH');
    if (analysis.entry.entryKey !== entryKey) throw new Error('RISK_ENTRY_KEY_MISMATCH');
    if (analysis.entry.entryCandleCloseTimeMs !== entryCandleCloseTimeMs) {
      throw new Error('RISK_ENTRY_TIME_MISMATCH');
    }
    if (Math.abs(analysis.entry.entryPrice - entryPrice) > Math.max(entryPrice * 1e-9, 1e-12)) {
      throw new Error('RISK_ENTRY_PRICE_MISMATCH');
    }

    if (analysis.passed) {
      const { stopLoss, targetPrice, riskDistance, riskBps, riskRewardRatio } = analysis.risk;
      if (
        stopLoss === null ||
        targetPrice === null ||
        riskDistance === null ||
        riskBps === null ||
        riskRewardRatio === null ||
        analysis.signalCandidateKey === null
      ) {
        throw new Error('PASSED_RISK_RESULT_MISSING_EVIDENCE');
      }
      if (riskRewardRatio < 2) throw new Error('RISK_REWARD_BELOW_2');
      if (direction === 'LONG' && !(stopLoss < entryPrice && targetPrice > entryPrice)) {
        throw new Error('INVALID_LONG_RISK_GEOMETRY');
      }
      if (direction === 'SHORT' && !(stopLoss > entryPrice && targetPrice < entryPrice)) {
        throw new Error('INVALID_SHORT_RISK_GEOMETRY');
      }
    }

    return {
      source: 'bybit-v5-public',
      scanner: 'tradebot-python',
      stage: 'FINAL_RISK_CANDIDATE',
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

    const riskEvaluations: Array<{
      entry: (typeof selected)[number];
      risk: FinalRiskCandidateResult;
    }> = [];
    const riskFailures: Array<{
      entryRank: number;
      symbol: string;
      direction: TradingDirection;
      entryKey: string;
      code: string;
    }> = [];

    for (let offset = 0; offset < selected.length; offset += RISK_BATCH_CONCURRENCY) {
      const batch = selected.slice(offset, offset + RISK_BATCH_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (entry) => {
          try {
            const risk = await this.analyzeFinalRiskCandidate(
              entry.symbol,
              entry.direction,
              entry.latestClose,
              entry.entryCandleCloseTimeMs,
              entry.entryKey,
            );
            return { ok: true as const, value: { entry, risk } };
          } catch (error) {
            return {
              ok: false as const,
              value: {
                entryRank: entry.entryRank,
                symbol: entry.symbol,
                direction: entry.direction,
                entryKey: entry.entryKey,
                code: failureCode(error, 'FINAL_RISK_VALIDATION_FAILED'),
              },
            };
          }
        }),
      );

      for (const result of batchResults) {
        if (result.ok) riskEvaluations.push(result.value);
        else riskFailures.push(result.value);
      }
    }

    const riskQualified = riskEvaluations
      .filter((evaluation) => evaluation.risk.passed)
      .sort((left, right) =>
        left.entry.entryRank - right.entry.entryRank ||
        left.entry.symbol.localeCompare(right.entry.symbol),
      );

    const uniqueRiskQualified: typeof riskQualified = [];
    const seenCandidateKeys = new Set<string>();
    const riskDuplicates: Array<{
      entryRank: number;
      symbol: string;
      direction: TradingDirection;
      signalCandidateKey: string;
      reason: 'DUPLICATE_FINAL_SIGNAL_CANDIDATE_KEY';
    }> = [];

    for (const evaluation of riskQualified) {
      const key = evaluation.risk.signalCandidateKey;
      if (key === null) continue;
      if (seenCandidateKeys.has(key)) {
        riskDuplicates.push({
          entryRank: evaluation.entry.entryRank,
          symbol: evaluation.entry.symbol,
          direction: evaluation.entry.direction,
          signalCandidateKey: key,
          reason: 'DUPLICATE_FINAL_SIGNAL_CANDIDATE_KEY',
        });
        continue;
      }
      seenCandidateKeys.add(key);
      uniqueRiskQualified.push(evaluation);
    }

    const finalSelected = uniqueRiskQualified
      .slice(0, FINAL_CANDIDATE_LIMIT)
      .map((evaluation, index) => ({
        candidateRank: index + 1,
        entryRank: evaluation.entry.entryRank,
        setupRank: evaluation.entry.setupRank,
        oneHourRank: evaluation.entry.oneHourRank,
        universeRank: evaluation.entry.universeRank,
        symbol: evaluation.entry.symbol,
        direction: evaluation.entry.direction,
        entryPrice: evaluation.risk.entry.entryPrice,
        stopLoss: evaluation.risk.risk.stopLoss,
        targetPrice: evaluation.risk.risk.targetPrice,
        riskDistance: evaluation.risk.risk.riskDistance,
        riskBps: evaluation.risk.risk.riskBps,
        riskRewardRatio: evaluation.risk.risk.riskRewardRatio,
        swingPrice: evaluation.risk.risk.swingPrice,
        swingCandleCloseTimeMs: evaluation.risk.risk.swingCandleCloseTimeMs,
        swingAgeCandles: evaluation.risk.risk.swingAgeCandles,
        entryCandleCloseTimeMs: evaluation.entry.entryCandleCloseTimeMs,
        entryKey: evaluation.entry.entryKey,
        signalCandidateKey: evaluation.risk.signalCandidateKey,
        volumeRatio: evaluation.entry.volumeRatio,
        sweepDepthBps: evaluation.entry.sweepDepthBps,
        reasons: evaluation.risk.reasons,
        signalCandidate: true as const,
        actionable: false as const,
      }));

    const riskRejected = riskEvaluations
      .filter((evaluation) => !evaluation.risk.passed)
      .map((evaluation) => ({
        entryRank: evaluation.entry.entryRank,
        symbol: evaluation.entry.symbol,
        direction: evaluation.entry.direction,
        entryPrice: evaluation.risk.entry.entryPrice,
        stopLoss: evaluation.risk.risk.stopLoss,
        swingPrice: evaluation.risk.risk.swingPrice,
        swingCandleCloseTimeMs: evaluation.risk.risk.swingCandleCloseTimeMs,
        reasons: evaluation.risk.reasons,
      }));

    return {
      source: 'bybit-v5-public',
      scanner: 'tradebot-python',
      pipelineStage: 'TOP_50_TO_20_TO_10_TO_3_TO_FINAL_RISK_CANDIDATES',
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      limits: {
        universe: upstream.limits.universe,
        oneHourQualified: upstream.limits.oneHourQualified,
        fifteenMinuteSetups: upstream.limits.fifteenMinuteSetups,
        fiveMinuteEntries: FIVE_MINUTE_ENTRY_LIMIT,
        finalCandidates: FINAL_CANDIDATE_LIMIT,
        fiveMinuteConcurrency: FIVE_MINUTE_BATCH_CONCURRENCY,
        riskConcurrency: RISK_BATCH_CONCURRENCY,
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
      finalCandidates: {
        requestedCount: selected.length,
        scannedCount: riskEvaluations.length,
        qualifiedCount: riskQualified.length,
        uniqueQualifiedCount: uniqueRiskQualified.length,
        selectedCount: finalSelected.length,
        rejectedCount: riskRejected.length,
        duplicateCount: riskDuplicates.length,
        failedCount: riskFailures.length,
        selected: finalSelected,
        rejected: riskRejected,
        duplicates: riskDuplicates,
        failures: riskFailures,
      },
      entryFreshnessRule: 'LATEST_CLOSED_5M_CANDLE_MUST_BE_THE_ENTRY_CANDLE',
      duplicatePolicy: 'UNIQUE_SYMBOL_DIRECTION_CANDLE_KEY',
      riskPolicy: 'LATEST_CONFIRMED_15M_SWING_WITH_FIXED_MINIMUM_RR_1_TO_2',
      finalDuplicatePolicy: 'UNIQUE_FINAL_SIGNAL_CANDIDATE_KEY_WITHIN_SCAN',
      nextStage: 'PERSISTENT_SIGNAL_STORE_AND_EXECUTION_GUARDS_PENDING',
      signalGenerationEnabled: false,
      actionable: false,
      executionEnabled: false,
    } as const;
  }
}
