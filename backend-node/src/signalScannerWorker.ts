type SignalWorkerState = 'DISABLED' | 'IDLE' | 'RUNNING' | 'HEALTHY' | 'FAILED';
type SignalWorkerTrigger = 'SCHEDULED' | 'STARTUP' | 'TEST';

export interface SignalWorkerPipelineCounts {
  universe: number;
  oneHour: number;
  fifteenMinute: number;
  fiveMinute: number;
  finalCandidates: number;
}

interface SignalScanResult {
  generatedAt: string;
  durationMs: number;
  pipelineCounts: SignalWorkerPipelineCounts;
  persistence: {
    insertedCount: number;
    duplicateSuppressedCount: number;
    totalStored: number;
  };
  signalPersistenceEnabled: true;
  actionable: false;
  executionEnabled: false;
}

interface SignalScanRunner {
  scanAndPersist(): Promise<SignalScanResult>;
}

export interface SignalScannerWorkerOptions {
  enabled: boolean;
  intervalMs: number;
  initialDelayMs: number;
  runTimeoutMs: number;
  runner: SignalScanRunner;
  now?: () => number;
}

export interface SignalWorkerRunRecord {
  runId: string;
  trigger: SignalWorkerTrigger;
  cycleId: number;
  scheduledAt: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  scheduleDriftMs: number;
  state: Exclude<SignalWorkerState, 'DISABLED' | 'IDLE'>;
  pipelineCounts: SignalWorkerPipelineCounts | null;
  persistence: {
    insertedCount: number;
    duplicateSuppressedCount: number;
    totalStored: number;
  } | null;
  issues: string[];
}

export interface SignalScannerWorkerStatus {
  service: 'automated-signal-scanner';
  enabled: boolean;
  state: SignalWorkerState;
  intervalMs: number;
  runTimeoutMs: number;
  running: boolean;
  nextRunAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  skippedOverlaps: number;
  skippedDuplicateCycles: number;
  lastRun: SignalWorkerRunRecord | null;
  signalPersistenceEnabled: true;
  executionEnabled: false;
}

function iso(timeMs: number): string {
  return new Date(timeMs).toISOString();
}

function errorCode(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function uniqueIssues(issues: string[]): string[] {
  return [...new Set(issues)];
}

let registeredWorker: SignalScannerWorker | null = null;

export function registerSignalScannerWorker(worker: SignalScannerWorker): void {
  registeredWorker = worker;
}

export function getRegisteredSignalScannerWorkerStatus(): SignalScannerWorkerStatus | null {
  return registeredWorker?.getStatus() ?? null;
}

export class SignalScannerWorker {
  private readonly now: () => number;
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<void> | null = null;
  private lastScheduledCycleId: number | null = null;
  private status: SignalScannerWorkerStatus;

  public constructor(private readonly options: SignalScannerWorkerOptions) {
    this.now = options.now ?? Date.now;
    this.status = {
      service: 'automated-signal-scanner',
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
      signalPersistenceEnabled: true,
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

  public getStatus(): SignalScannerWorkerStatus {
    return structuredClone(this.status);
  }

  public async runNow(
    trigger: SignalWorkerTrigger = 'TEST',
    scheduledAtMs = this.now(),
  ): Promise<void> {
    if (!this.options.enabled) return;

    const cycleId = Math.floor(scheduledAtMs / this.options.intervalMs);
    if (trigger !== 'TEST' && this.lastScheduledCycleId === cycleId) {
      this.status.skippedDuplicateCycles += 1;
      this.log('SIGNAL_WORKER_DUPLICATE_CYCLE_SKIPPED', { cycleId, trigger });
      return;
    }

    if (this.activeRun) {
      this.status.skippedOverlaps += 1;
      if (this.status.lastRun) {
        this.status.lastRun.issues = uniqueIssues([
          ...this.status.lastRun.issues,
          'PREVIOUS_SIGNAL_WORKER_RUN_STILL_ACTIVE',
        ]);
      }
      this.log('SIGNAL_WORKER_OVERLAP_SKIPPED', { cycleId, trigger });
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
      current.issues = uniqueIssues([...current.issues, 'SIGNAL_WORKER_RUN_TIMEOUT']);
      this.status.state = 'FAILED';
      this.log('SIGNAL_WORKER_RUN_TIMEOUT', {
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

  private schedule(targetMs: number, trigger: SignalWorkerTrigger): void {
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
    trigger: SignalWorkerTrigger,
    scheduledAtMs: number,
    cycleId: number,
  ): Promise<void> {
    const startedAtMs = this.now();
    const run: SignalWorkerRunRecord = {
      runId: `signal-worker:${cycleId}:${startedAtMs}`,
      trigger,
      cycleId,
      scheduledAt: iso(scheduledAtMs),
      startedAt: iso(startedAtMs),
      finishedAt: null,
      durationMs: null,
      scheduleDriftMs: Math.max(0, startedAtMs - scheduledAtMs),
      state: 'RUNNING',
      pipelineCounts: null,
      persistence: null,
      issues: [],
    };
    this.status.lastRun = run;

    try {
      const result = await this.options.runner.scanAndPersist();
      run.pipelineCounts = result.pipelineCounts;
      run.persistence = result.persistence;
      run.issues = uniqueIssues([...run.issues, ...this.validateResult(result)]);
      if (!run.issues.includes('SIGNAL_WORKER_RUN_TIMEOUT')) {
        run.state = run.issues.length > 0 ? 'FAILED' : 'HEALTHY';
      }
    } catch (error) {
      run.issues = uniqueIssues([...run.issues, errorCode(error, 'SIGNAL_WORKER_RUN_FAILED')]);
      run.state = 'FAILED';
    } finally {
      const finishedAtMs = this.now();
      run.finishedAt = iso(finishedAtMs);
      run.durationMs = finishedAtMs - startedAtMs;

      if (run.state === 'HEALTHY') {
        this.status.lastSuccessAt = run.finishedAt;
        this.status.consecutiveFailures = 0;
      } else {
        this.status.consecutiveFailures += 1;
      }
      this.status.state = run.state;
      this.log('SIGNAL_WORKER_RUN_FINISHED', run);
    }
  }

  private validateResult(result: SignalScanResult): string[] {
    const issues: string[] = [];
    const counts = result.pipelineCounts;

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

    const persistedThisRun =
      result.persistence.insertedCount + result.persistence.duplicateSuppressedCount;
    if (persistedThisRun !== counts.finalCandidates) {
      issues.push('SIGNAL_WORKER_PERSISTENCE_COUNT_MISMATCH');
    }
    if (result.persistence.totalStored < result.persistence.insertedCount) {
      issues.push('SIGNAL_WORKER_TOTAL_STORED_INVALID');
    }
    if (
      !result.signalPersistenceEnabled ||
      result.actionable ||
      result.executionEnabled
    ) {
      issues.push('SIGNAL_WORKER_SAFETY_FLAG_VIOLATION');
    }
    if (!Number.isFinite(Date.parse(result.generatedAt))) {
      issues.push('SIGNAL_WORKER_TIMESTAMP_INVALID');
    }
    if (!Number.isFinite(result.durationMs) || result.durationMs < 0) {
      issues.push('SIGNAL_WORKER_DURATION_INVALID');
    }

    return issues;
  }

  private log(event: string, data: unknown): void {
    console.log(JSON.stringify({
      component: 'automated-signal-scanner',
      event,
      loggedAt: new Date(this.now()).toISOString(),
      data,
      signalPersistenceEnabled: true,
      executionEnabled: false,
    }));
  }
}
