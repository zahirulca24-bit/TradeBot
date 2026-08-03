import type { FiveMinutePipelineService } from './fiveMinutePipeline.js';
import {
  registerSignalScannerWorker,
  SignalScannerWorker,
  type SignalScannerWorkerStatus,
  type SignalWorkerPipelineCounts,
} from './signalScannerWorker.js';
import { SignalStore, type SignalCandidateInput, type SignalUpsertResult } from './signalStore.js';

function requirePositive(value: number | null, code: string): number {
  if (value === null || !Number.isFinite(value) || value <= 0) throw new Error(code);
  return value;
}

function requireTimestamp(value: number | null, code: string): number {
  if (value === null || !Number.isInteger(value) || value <= 0) throw new Error(code);
  return value;
}

function requirePositiveInteger(value: number | null, code: string): number {
  if (value === null || !Number.isInteger(value) || value < 1) throw new Error(code);
  return value;
}

function requireKey(value: string | null): string {
  if (value === null || value.length === 0) throw new Error('FINAL_CANDIDATE_KEY_MISSING');
  return value;
}

function booleanEnvironment(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`INVALID_${name}`);
}

function integerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`INVALID_${name}`);
  }
  return value;
}

export interface SignalScanPersistenceResult {
  source: 'tradebot-pipeline';
  generatedAt: string;
  durationMs: number;
  pipelineCounts: SignalWorkerPipelineCounts;
  persistence: SignalUpsertResult;
  storage: ReturnType<SignalStore['storageInfo']>;
  crossCycleDuplicateProtection: 'UNIQUE_FINAL_SIGNAL_CANDIDATE_KEY';
  signalPersistenceEnabled: true;
  actionable: false;
  executionEnabled: false;
}

export class SignalService {
  private activeScan: Promise<SignalScanPersistenceResult> | null = null;
  private readonly worker: SignalScannerWorker;

  public constructor(
    private readonly pipeline: FiveMinutePipelineService,
    private readonly store: SignalStore,
  ) {
    this.worker = new SignalScannerWorker({
      enabled: booleanEnvironment('SIGNAL_WORKER_ENABLED', true),
      intervalMs: integerEnvironment(
        'SIGNAL_WORKER_INTERVAL_MS',
        15 * 60_000,
        60_000,
        3_600_000,
      ),
      initialDelayMs: integerEnvironment(
        'SIGNAL_WORKER_INITIAL_DELAY_MS',
        30_000,
        0,
        300_000,
      ),
      runTimeoutMs: integerEnvironment(
        'SIGNAL_WORKER_RUN_TIMEOUT_MS',
        13 * 60_000,
        60_000,
        840_000,
      ),
      runner: {
        scanAndPersist: () => this.scanAndPersist(),
      },
    });
    registerSignalScannerWorker(this.worker);
    this.worker.start();
  }

  public getWorkerStatus(): SignalScannerWorkerStatus {
    return this.worker.getStatus();
  }

  public async list(limit: number) {
    const signals = await this.store.list(limit);
    const longCount = signals.filter((signal) => signal.direction === 'LONG').length;
    const shortCount = signals.filter((signal) => signal.direction === 'SHORT').length;
    const repeatSeenCount = signals.reduce((sum, signal) => sum + Math.max(0, signal.seenCount - 1), 0);

    return {
      source: 'persistent-signal-store',
      generatedAt: new Date().toISOString(),
      count: signals.length,
      summary: {
        validCount: signals.length,
        longCount,
        shortCount,
        repeatSeenCount,
        executedCount: 0,
      },
      storage: this.store.storageInfo(),
      worker: this.worker.getStatus(),
      signals,
      actionable: false,
      executionEnabled: false,
    } as const;
  }

  public async scanAndPersist(): Promise<SignalScanPersistenceResult> {
    if (this.activeScan) return this.activeScan;

    const run = this.executeScanAndPersist();
    this.activeScan = run;
    try {
      return await run;
    } finally {
      if (this.activeScan === run) this.activeScan = null;
    }
  }

  private async executeScanAndPersist(): Promise<SignalScanPersistenceResult> {
    const pipeline = await this.pipeline.scanTopUniverseFiveMinute();
    const candidates: SignalCandidateInput[] = pipeline.finalCandidates.selected.map((candidate) => ({
      signalCandidateKey: requireKey(candidate.signalCandidateKey),
      symbol: candidate.symbol,
      direction: candidate.direction,
      entryPrice: candidate.entryPrice,
      stopLoss: requirePositive(candidate.stopLoss, 'FINAL_STOP_LOSS_MISSING'),
      targetPrice: requirePositive(candidate.targetPrice, 'FINAL_TARGET_PRICE_MISSING'),
      riskDistance: requirePositive(candidate.riskDistance, 'FINAL_RISK_DISTANCE_MISSING'),
      riskRewardRatio: requirePositive(candidate.riskRewardRatio, 'FINAL_RISK_REWARD_MISSING'),
      riskBps: requirePositive(candidate.riskBps, 'FINAL_RISK_BPS_MISSING'),
      swingPrice: requirePositive(candidate.swingPrice, 'FINAL_SWING_PRICE_MISSING'),
      swingAgeCandles: requirePositiveInteger(candidate.swingAgeCandles, 'FINAL_SWING_AGE_MISSING'),
      entryKey: candidate.entryKey,
      volumeRatio: candidate.volumeRatio,
      sweepDepthBps: candidate.sweepDepthBps,
      entryCandleCloseTimeMs: candidate.entryCandleCloseTimeMs,
      swingCandleCloseTimeMs: requireTimestamp(
        candidate.swingCandleCloseTimeMs,
        'FINAL_SWING_TIME_MISSING',
      ),
      reasons: candidate.reasons,
      candidateRank: candidate.candidateRank,
    }));

    const persistence = await this.store.upsert(candidates, pipeline.generatedAt);
    return {
      source: 'tradebot-pipeline',
      generatedAt: pipeline.generatedAt,
      durationMs: pipeline.durationMs,
      pipelineCounts: {
        universe: pipeline.universe.selectedCount,
        oneHour: pipeline.oneHour.selectedCount,
        fifteenMinute: pipeline.fifteenMinute.selectedCount,
        fiveMinute: pipeline.fiveMinute.selectedCount,
        finalCandidates: pipeline.finalCandidates.selectedCount,
      },
      persistence,
      storage: this.store.storageInfo(),
      crossCycleDuplicateProtection: 'UNIQUE_FINAL_SIGNAL_CANDIDATE_KEY',
      signalPersistenceEnabled: true,
      actionable: false,
      executionEnabled: false,
    };
  }
}
