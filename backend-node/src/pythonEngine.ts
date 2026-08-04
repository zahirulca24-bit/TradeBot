export interface PythonReadinessOptions {
  baseUrl: string;
  internalServiceToken: string;
  timeoutMs: number;
  attempts: number;
}

export interface PythonReadinessResult {
  ready: boolean;
  reason: string | null;
  attempts: number;
  upstreamStatus: number | null;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPayloadReason(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.reason === 'string') return payload.reason;
  if (isRecord(payload.detail) && typeof payload.detail.code === 'string') {
    return payload.detail.code;
  }
  return null;
}

function isReadyPayload(payload: unknown): boolean {
  return isRecord(payload) && payload.ready === true;
}

function normalizeFetchError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'PYTHON_ENGINE_TIMEOUT';
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'PYTHON_ENGINE_TIMEOUT';
  }
  return 'PYTHON_ENGINE_UNREACHABLE';
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(attempt: number, reason: string, status: number | null): number {
  const coldStartLike =
    reason === 'PYTHON_ENGINE_NON_JSON_RESPONSE' ||
    reason === 'PYTHON_ENGINE_TIMEOUT' ||
    reason === 'PYTHON_ENGINE_UNREACHABLE' ||
    (status !== null && isTransientStatus(status));

  if (coldStartLike) return Math.min(5_000 * attempt, 15_000);
  return Math.min(1_000 * attempt, 3_000);
}

export async function checkPythonEngineReady(
  options: PythonReadinessOptions,
): Promise<PythonReadinessResult> {
  let lastReason = 'PYTHON_ENGINE_UNAVAILABLE';
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const response = await fetch(`${options.baseUrl}/ready`, {
        headers: {
          accept: 'application/json',
          'x-internal-service-token': options.internalServiceToken,
        },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      lastStatus = response.status;

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('application/json')) {
        lastReason = 'PYTHON_ENGINE_NON_JSON_RESPONSE';
      } else {
        const payload = await response.json().catch(() => null);
        if (response.ok && isReadyPayload(payload)) {
          return {
            ready: true,
            reason: null,
            attempts: attempt,
            upstreamStatus: response.status,
          };
        }
        lastReason = getPayloadReason(payload) || 'PYTHON_ENGINE_NOT_READY';
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ready: false,
          reason: 'PYTHON_ENGINE_AUTH_FAILED',
          attempts: attempt,
          upstreamStatus: response.status,
        };
      }
    } catch (error) {
      lastReason = normalizeFetchError(error);
    }

    if (attempt < options.attempts) {
      await sleep(retryDelayMs(attempt, lastReason, lastStatus));
    }
  }

  return {
    ready: false,
    reason: lastReason,
    attempts: options.attempts,
    upstreamStatus: lastStatus,
  };
}
