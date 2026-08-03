import {
  getRegisteredSignalScannerWorkerStatus,
  type SignalScannerWorkerStatus,
  type SignalWorkerPipelineCounts,
} from './signalScannerWorker.js';

type WatchdogState = 'DISABLED' | 'IDLE' | 'RUNNING' | 'HEALTHY' | 'DEGRADED' | 'FAILED';
type WatchdogTrigger = 'SCHEDULED' | 'STARTUP' | 'TEST';

type PythonReadiness = {
  ready: boolean;
  reason: string | null;
  attempts: number;
  upstreamStatus: number | null;
};

type DemoHealth = {
  connected: boolean;
  reason: string | null;
};

interface MarketClockChecker {
  assertClockSafe(): Promise<{ skewMs: number }>;
}

export interface PipelineWatchdogOptions {
  enabled: boolean;
  intervalMs: number;
  initialDelayMs: number;
  runTimeoutMs: number;
  pipeline: { scanTopUniverseFiveMinute(): Promise<unknown> };
  marketData: MarketClockChecker;
  getPythonReadiness: () => Promise<PythonReadiness>;
  getDemoHealth: () => Promise<DemoHealth>;
  now?: () => number;
}

export interface WatchdogRunRecord {
  runId: string;
  trigger: WatchdogTrigger;
  cycleId: number;
  scheduledAt: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  scheduleDriftMs: number;
  state: Exclude<WatchdogState, 'DISABLED' | 'IDLE'>;
  dependencies: {
    marketData: boolean;
    pythonEngine: boolean;
    bybitDemo: boolean;
    signalWorker: boolean;
    clockSkewMs: number | null;
    pythonReason: string | null;
    demoReason: string | null;
    signalWorkerReason: string | null;
  };
  counts: SignalWorkerPipelineCounts | null;
  signalWorker: SignalScannerWorkerStatus | null;
  issues: string[];
}

export interface PipelineWatchdogStatus {
  service: 'pipeline-watchdog';
  enabled: boolean;
  state: WatchdogState;
  intervalMs: number;
  runTimeoutMs: number;
  running: boolean;
  nextRunAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  skippedOverlaps: number;
  skippedDuplicateCycles: number;
  lastRun: WatchdogRunRecord | null;
  signalWorker: SignalScannerWorkerStatus | null;
  signalPersistenceEnabled: false;
  supervisedSignalPersistenceEnabled: true;
  executionEnabled: false;
}

function errorCode(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function iso(timeMs: number): string {
  return new Date(timeMs).toISOString();
}

function uniqueIssues(issues: string[]): string[] {
  return [...new Set(issues)];
}

export class PipelineWatchdog {
  private readonly now: () => number;
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<void> | null = null;
  private lastScheduledCycleId: number | null = null;
  private status: PipelineWatchdogStatus;

  public constructor(private readonly options: PipelineWatchdogOptions) {
    this.now = options.now ?? Date.now;
    this.status = {
      service: 'pipeline-watchdog',
      enabled: options.enabled,
      state: options.enabled ? 'IDLE' : 'DISABLED',
      intervalMs: options.intervalMs,
      runTimeoutMs: options.runTimeoutMs,
      running: false,
      nextRunAt: null,
      lastSuccessAt: null,
      consecutiveFailures: 0,
      skippedOverlaps: 0,
      skippedDuplicateCycles: 0,
      lastRun: null,
      signalWorker: getRegisteredSignalScannerWorkerStatus(),
      signalPersistenceEnabled: false,
      supervisedSignalPersistenceEnabled: true,
      executionEnabled: false,
    };
  }

  public start(): void {
    if (!this.options.enabled || this.timer) return;
    this.schedule(this.now() + this.options.initialDelayMs, 'STARTUP');
  }

  public stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.status.nextRunAt = null;
  }

  public getStatus(): PipelineWatchdogStatus {
    this.status.signalWorker = getRegisteredSignalScannerWorkerStatus();
    return structuredClone(this.status);
  }

  public async runNow(trigger: WatchdogTrigger = 'TEST', scheduledAtMs = this.now()): Promise<void> {
    if (!this.options.enabled) return;

    const cycleId = Math.floor(scheduledAtMs / this.options.intervalMs);
    if (trigger !== 'TEST' && this.lastScheduledCycleId === cycleId) {
      this.status.skippedDuplicateCycles += 1;
      this.log('WATCHDOG_DUPLICATE_CYCLE_SKIPPED', { cycleId, trigger });
      return;
    }

    if (this.activeRun) {
      this.status.skippedOverlaps += 1;
      if (this.status.lastRun) {
        this.status.lastRun.issues = uniqueIssues([
          ...this.status.lastRun.issues,
          'PREVIOUS_WATCHDOG_RUN_STILL_ACTIVE',
        ]);
      }
      this.log('WATCHDOG_OVERLAP_SKIPPED', { cycleId, trigger });
      return;
    }

    if (trigger !== 'TEST') this.lastScheduledCycleId = cycleId;

    const runPromise = this.executeRun(trigger, scheduledAtMs, cycleId);
    this.activeRun = runPromise;
    this.status.running = true;
    this.status.state = 'RUNNING';

    const timeoutTimer = setTimeout(() => {
      const current = this.status.lastRun;
      if (!current || current.cycleId !== cycleId || current.state !== 'RUNNING') return;
      current.state = 'FAILED';
      current.issues = uniqueIssues([...current.issues, 'WATCHDOG_RUN_TIMEOUT']);
      this.status.state = 'FAILED';
      this.log('WATCHDOG_RUN_TIMEOUT', {
        cycleId,
        trigger,
        timeoutMs: this.options.runTimeoutMs,
      });
    }, this.options.runTimeoutMs);
    timeoutTimer.unref?.();

    try {
      await runPromise;
    } finally {
      clearTimeout(timeoutTimer);
      if (this.activeRun === runPromise) {
        this.activeRun = null;
        this.status.running = false;
      }
    }
  }

  private schedule(targetMs: number, trigger: WatchdogTrigger): void {
    this.status.nextRunAt = iso(targetMs);
    const delay = Math.max(0, targetMs - this.now());
    this.timer = setTimeout(() => {
      const scheduledAtMs = targetMs;
      this.schedule(targetMs + this.options.intervalMs, 'SCHEDULED');
      void this.runNow(trigger, scheduledAtMs);
    }, delay);
    this.timer.unref?.();
  }

  private async executeRun(
    trigger: WatchdogTrigger,
    scheduledAtMs: number,
    cycleId: number,
  ): Promise<void> {
    const startedAtMs = this.now();
    const run: WatchdogRunRecord = {
      runId: `watchdog:${cycleId}:${startedAtMs}`,
      trigger,
      cycleId,
      scheduledAt: iso(scheduledAtMs),
      startedAt: iso(startedAtMs),
      finishedAt: null,
      durationMs: null,
      scheduleDriftMs: Math.max(0, startedAtMs - scheduledAtMs),
      state: 'RUNNING',
      dependencies: {
        marketData: false,
        pythonEngine: false,
        bybitDemo: false,
        signalWorker: false,
        clockSkewMs: null,
        pythonReason: null,
        demoReason: null,
        signalWorkerReason: null,
      },
      counts: null,
      signalWorker: null,
      issues: [],
    };
    this.status.lastRun = run;

    try {
      const [clockResult, pythonResult, demoResult] = await Promise.allSettled([
        this.options.marketData.assertClockSafe(),
        this.options.getPythonReadiness(),
        this.options.getDemoHealth(),
      ]);

      if (clockResult.status === 'fulfilled') {
        run.dependencies.marketData = true;
        run.dependencies.clockSkewMs = clockResult.value.skewMs;
      } else {
        run.issues.push(errorCode(clockResult.reason, 'MARKET_DATA_UNAVAILABLE'));
      }

      if (pythonResult.status === 'fulfilled') {
        run.dependencies.pythonEngine = pythonResult.value.ready;
        run.dependencies.pythonReason = pythonResult.value.reason;
        if (!pythonResult.value.ready) run.issues.push('PYTHON_ENGINE_UNAVAILABLE');
      } else {
        run.dependencies.pythonReason = errorCode(pythonResult.reason, 'PYTHON_ENGINE_UNAVAILABLE');
        run.issues.push('PYTHON_ENGINE_UNAVAILABLE');
      }

      if (demoResult.status === 'fulfilled') {
        run.dependencies.bybitDemo = demoResult.value.connected;
        run.dependencies.demoReason = demoResult.value.reason;
        if (!demoResult.value.connected) run.issues.push('BYBIT_DEMO_UNAVAILABLE');
      } else {
        run.dependencies.demoReason = errorCode(demoResult.reason, 'BYBIT_DEMO_UNAVAILABLE');
        run.issues.push('BYBIT_DEMO_UNAVAILABLE');
      }

      const worker = getRegisteredSignalScannerWorkerStatus();
      run.signalWorker = worker;
      this.status.signalWorker = worker;
      this.evaluateSignalWorker(worker, run, startedAtMs);

      if (
        !run.dependencies.marketData ||
        !run.dependencies.pythonEngine ||
        !run.dependencies.signalWorker
      ) {
        throw new Error('WATCHDOG_REQUIRED_DEPENDENCY_UNAVAILABLE');
      }

      run.issues = uniqueIssues(run.issues);
      const hardFailure = run.issues.some((issue) =>
        [
          'WATCHDOG_RUN_TIMEOUT',
          'SIGNAL_WORKER_UNAVAILABLE',
          'SIGNAL_WORKER_FAILED',
          'SIGNAL_WORKER_STALE',
          'SIGNAL_WORKER_PIPELINE_LIMIT_VIOLATION',
          'SIGNAL_WORKER_STAGE_ORDER_VIOLATION',
          'SIGNAL_WORKER_SAFETY_FLAG_VIOLATION',
          'WATCHDOG_REQUIRED_DEPENDENCY_UNAVAILABLE',
        ].includes(issue),
      );
      run.state = hardFailure ? 'FAILED' : run.issues.length > 0 ? 'DEGRADED' : 'HEALTHY';
    } catch (error) {
      run.issues = uniqueIssues([...run.issues, errorCode(error, 'WATCHDOG_RUN_FAILED')]);
      run.state = 'FAILED';
    } finally {
      const finishedAtMs = this.now();
      run.finishedAt = iso(finishedAtMs);
      run.durationMs = finishedAtMs - startedAtMs;

      if (run.state === 'HEALTHY' || run.state === 'DEGRADED') {
        this.status.lastSuccessAt = run.finishedAt;
        this.status.consecutiveFailures = 0;
      } else {
        this.status.consecutiveFailures += 1;
      }
      this.status.state = run.state;
      this.log('WATCHDOG_RUN_FINISHED', run);
    }
  }

  private evaluateSignalWorker(
    worker: SignalScannerWorkerStatus | null,
    run: WatchdogRunRecord,
    observedAtMs: number,
  ): void {
    if (!worker || !worker.enabled) {
      run.dependencies.signalWorkerReason = 'SIGNAL_WORKER_UNAVAILABLE';
      run.issues.push('SIGNAL_WORKER_UNAVAILABLE');
      return;
    }

    run.counts = worker.lastRun?.pipelineCounts ?? null;

    if (!worker.signalPersistenceEnabled || worker.executionEnabled) {
      run.dependencies.signalWorkerReason = 'SIGNAL_WORKER_SAFETY_FLAG_VIOLATION';
      run.issues.push('SIGNAL_WORKER_SAFETY_FLAG_VIOLATION');
      return;
    }

    if (worker.state === 'FAILED' || worker.consecutiveFailures > 0) {
      run.dependencies.signalWorkerReason = 'SIGNAL_WORKER_FAILED';
      run.issues.push('SIGNAL_WORKER_FAILED');
      return;
    }

    if (worker.lastSuccessAt) {
      const lastSuccessMs = Date.parse(worker.lastSuccessAt);
      const maximumAgeMs = worker.intervalMs + worker.runTimeoutMs + 60_000;
      if (!Number.isFinite(lastSuccessMs) || observedAtMs - lastSuccessMs > maximumAgeMs) {
        run.dependencies.signalWorkerReason = 'SIGNAL_WORKER_STALE';
        run.issues.push('SIGNAL_WORKER_STALE');
        return;
      }
    } else if (!worker.running) {
      run.dependencies.signalWorkerReason = 'SIGNAL_WORKER_NOT_STARTED';
      run.issues.push('SIGNAL_WORKER_NOT_STARTED');
    }

    const countIssues = this.validateCounts(run.counts);
    run.issues.push(...countIssues);
    if (countIssues.length > 0) {
      run.dependencies.signalWorkerReason = countIssues[0] ?? 'SIGNAL_WORKER_INVALID_COUNTS';
      return;
    }

    run.dependencies.signalWorker = true;
    run.dependencies.signalWorkerReason = worker.running ? 'SIGNAL_WORKER_RUNNING' : null;
  }

  private validateCounts(counts: SignalWorkerPipelineCounts | null): string[] {
    if (!counts) return [];
    const issues: string[] = [];

    if (
      counts.universe > 50 ||
      counts.oneHour > 20 ||
      counts.fifteenMinute > 10 ||
      counts.fiveMinute > 3 ||
      counts.finalCandidates > 3
    ) {
      issues.push('SIGNAL_WORKER_PIPELINE_LIMIT_VIOLATION');
    }

    if (
      !(
        counts.universe >= counts.oneHour &&
        counts.oneHour >= counts.fifteenMinute &&
        counts.fifteenMinute >= counts.fiveMinute &&
        counts.fiveMinute >= counts.finalCandidates
      )
    ) {
      issues.push('SIGNAL_WORKER_STAGE_ORDER_VIOLATION');
    }

    return issues;
  }

  private log(event: string, data: unknown): void {
    console.log(JSON.stringify({
      component: 'pipeline-watchdog',
      event,
      loggedAt: new Date(this.now()).toISOString(),
      data,
      signalPersistenceEnabled: false,
      supervisedSignalPersistenceEnabled: true,
      executionEnabled: false,
    }));
  }
}
