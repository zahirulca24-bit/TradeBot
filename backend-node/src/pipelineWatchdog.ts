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

type PipelineSnapshot = {
  generatedAt: string;
  durationMs: number;
  universe: { selectedCount: number };
  oneHour: { selectedCount: number; failedCount: number };
  fifteenMinute: { selectedCount: number; failedCount: number };
  fiveMinute: { selectedCount: number; failedCount: number; duplicateCount: number };
  finalCandidates: { selectedCount: number; failedCount: number; duplicateCount: number };
  signalGenerationEnabled: false;
  actionable: false;
  executionEnabled: false;
};

interface PipelineRunner {
  scanTopUniverseFiveMinute(): Promise<PipelineSnapshot>;
}

interface MarketClockChecker {
  assertClockSafe(): Promise<{ skewMs: number }>;
}

export interface PipelineWatchdogOptions {
  enabled: boolean;
  intervalMs: number;
  initialDelayMs: number;
  runTimeoutMs: number;
  pipeline: PipelineRunner;
  marketData: MarketClockChecker;
  getPythonReadiness: () => Promise<PythonReadiness>;
  getDemoHealth: () => Promise<DemoHealth>;
  now?: () => number;
}

export interface WatchdogStageCounts {
  universe: number;
  oneHour: number;
  fifteenMinute: number;
  fiveMinute: number;
  finalCandidates: number;
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
    clockSkewMs: number | null;
    pythonReason: string | null;
    demoReason: string | null;
  };
  counts: WatchdogStageCounts | null;
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
  signalPersistenceEnabled: false;
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
  private nextRunAtMs: number | null = null;
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
      signalPersistenceEnabled: false,
      executionEnabled: false,
    };
  }

  public start(): void {
    if (!this.options.enabled || this.timer) return;
    const firstRunAt = this.now() + this.options.initialDelayMs;
    this.schedule(firstRunAt, 'STARTUP');
  }

  public stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAtMs = null;
    this.status.nextRunAt = null;
  }

  public getStatus(): PipelineWatchdogStatus {
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
      const issues = this.status.lastRun?.issues ?? [];
      if (this.status.lastRun) {
        this.status.lastRun.issues = uniqueIssues([...issues, 'PREVIOUS_WATCHDOG_RUN_STILL_ACTIVE']);
      }
      this.log('WATCHDOG_OVERLAP_SKIPPED', { cycleId, trigger });
      return;
    }

    if (trigger !== 'TEST') this.lastScheduledCycleId = cycleId;

    const runPromise = this.executeRun(trigger, scheduledAtMs, cycleId);
    this.activeRun = runPromise;
    this.status.running = true;
    this.status.state = 'RUNNING';

    const timeout = new Promise<'timeout'>((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), this.options.runTimeoutMs);
      timer.unref?.();
    });

    const outcome = await Promise.race([runPromise.then(() => 'completed' as const), timeout]);
    if (outcome === 'timeout') {
      const nowMs = this.now();
      const current = this.status.lastRun;
      if (current?.state === 'RUNNING') {
        current.finishedAt = iso(nowMs);
        current.durationMs = nowMs - Date.parse(current.startedAt);
        current.state = 'FAILED';
        current.issues = uniqueIssues([...current.issues, 'WATCHDOG_RUN_TIMEOUT']);
      }
      this.status.state = 'FAILED';
      this.status.consecutiveFailures += 1;
      this.log('WATCHDOG_RUN_TIMEOUT', { cycleId, trigger, timeoutMs: this.options.runTimeoutMs });
    }

    void runPromise.finally(() => {
      if (this.activeRun === runPromise) {
        this.activeRun = null;
        this.status.running = false;
      }
    });
  }

  private schedule(targetMs: number, trigger: WatchdogTrigger): void {
    this.nextRunAtMs = targetMs;
    this.status.nextRunAt = iso(targetMs);
    const delay = Math.max(0, targetMs - this.now());
    this.timer = setTimeout(() => {
      const scheduledAtMs = targetMs;
      const nextTarget = targetMs + this.options.intervalMs;
      this.schedule(nextTarget, 'SCHEDULED');
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
    const runId = `watchdog:${cycleId}:${startedAtMs}`;
    const run: WatchdogRunRecord = {
      runId,
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
        clockSkewMs: null,
        pythonReason: null,
        demoReason: null,
      },
      counts: null,
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

      if (!run.dependencies.marketData || !run.dependencies.pythonEngine) {
        throw new Error('WATCHDOG_REQUIRED_DEPENDENCY_UNAVAILABLE');
      }

      const pipeline = await this.options.pipeline.scanTopUniverseFiveMinute();
      run.counts = {
        universe: pipeline.universe.selectedCount,
        oneHour: pipeline.oneHour.selectedCount,
        fifteenMinute: pipeline.fifteenMinute.selectedCount,
        fiveMinute: pipeline.fiveMinute.selectedCount,
        finalCandidates: pipeline.finalCandidates.selectedCount,
      };

      run.issues.push(...this.validatePipeline(pipeline));
      run.issues = uniqueIssues(run.issues);

      const hasHardFailure = run.issues.some((issue) =>
        [
          'PIPELINE_LIMIT_VIOLATION',
          'PIPELINE_STAGE_ORDER_VIOLATION',
          'PIPELINE_SAFETY_FLAG_VIOLATION',
          'PIPELINE_TIMESTAMP_INVALID',
        ].includes(issue),
      );

      run.state = hasHardFailure ? 'FAILED' : run.issues.length > 0 ? 'DEGRADED' : 'HEALTHY';
    } catch (error) {
      run.issues = uniqueIssues([...run.issues, errorCode(error, 'WATCHDOG_RUN_FAILED')]);
      run.state = 'FAILED';
    } finally {
      const finishedAtMs = this.now();
      if (run.finishedAt === null) {
        run.finishedAt = iso(finishedAtMs);
        run.durationMs = finishedAtMs - startedAtMs;
      }

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

  private validatePipeline(pipeline: PipelineSnapshot): string[] {
    const issues: string[] = [];
    const counts = [
      pipeline.universe.selectedCount,
      pipeline.oneHour.selectedCount,
      pipeline.fifteenMinute.selectedCount,
      pipeline.fiveMinute.selectedCount,
      pipeline.finalCandidates.selectedCount,
    ];

    if (
      counts[0] > 50 ||
      counts[1] > 20 ||
      counts[2] > 10 ||
      counts[3] > 3 ||
      counts[4] > 3
    ) {
      issues.push('PIPELINE_LIMIT_VIOLATION');
    }
    if (!(counts[0] >= counts[1] && counts[1] >= counts[2] && counts[2] >= counts[3] && counts[3] >= counts[4])) {
      issues.push('PIPELINE_STAGE_ORDER_VIOLATION');
    }
    if (pipeline.actionable || pipeline.executionEnabled || pipeline.signalGenerationEnabled) {
      issues.push('PIPELINE_SAFETY_FLAG_VIOLATION');
    }
    if (!Number.isFinite(Date.parse(pipeline.generatedAt))) issues.push('PIPELINE_TIMESTAMP_INVALID');
    if (pipeline.oneHour.failedCount > 0) issues.push('ONE_HOUR_STAGE_FAILURES');
    if (pipeline.fifteenMinute.failedCount > 0) issues.push('FIFTEEN_MINUTE_STAGE_FAILURES');
    if (pipeline.fiveMinute.failedCount > 0) issues.push('FIVE_MINUTE_STAGE_FAILURES');
    if (pipeline.finalCandidates.failedCount > 0) issues.push('FINAL_RISK_STAGE_FAILURES');
    if (pipeline.fiveMinute.duplicateCount > 0) issues.push('FIVE_MINUTE_DUPLICATES_BLOCKED');
    if (pipeline.finalCandidates.duplicateCount > 0) issues.push('FINAL_CANDIDATE_DUPLICATES_BLOCKED');
    return issues;
  }

  private log(event: string, data: unknown): void {
    console.log(JSON.stringify({
      component: 'pipeline-watchdog',
      event,
      loggedAt: new Date(this.now()).toISOString(),
      data,
      signalPersistenceEnabled: false,
      executionEnabled: false,
    }));
  }
}
