import { z } from 'zod';

const transientStatuses = new Set([429, 500, 502, 503, 504]);

const engineErrorSchema = z.object({
  detail: z
    .object({
      code: z.string().optional(),
    })
    .optional(),
});

class NonRetryableScannerError extends Error {}

export interface ScannerRequestOptions {
  url: string;
  internalServiceToken: string;
  body: unknown;
  timeoutMs: number;
  attempts: number;
}

export interface ScannerJsonResult {
  payload: unknown;
  attempts: number;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function normalizeFetchError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'PYTHON_ENGINE_TIMEOUT';
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'PYTHON_ENGINE_TIMEOUT';
  }
  return 'PYTHON_ENGINE_UNREACHABLE';
}

export async function postScannerJsonWithRetry(
  options: ScannerRequestOptions,
): Promise<ScannerJsonResult> {
  let lastError = 'PYTHON_ENGINE_UNAVAILABLE';

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const response = await fetch(options.url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-internal-service-token': options.internalServiceToken,
        },
        body: JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('application/json')) {
        lastError = `PYTHON_ENGINE_NON_JSON_HTTP_${response.status}`;
        if (!transientStatuses.has(response.status)) {
          throw new NonRetryableScannerError(lastError);
        }
      } else {
        const payload = await response.json().catch(() => null);
        if (payload === null) {
          lastError = 'PYTHON_ENGINE_INVALID_JSON';
        } else if (response.ok) {
          return { payload, attempts: attempt };
        } else {
          const parsedError = engineErrorSchema.safeParse(payload);
          const code = parsedError.success ? parsedError.data.detail?.code : undefined;
          lastError = code || `PYTHON_ENGINE_HTTP_${response.status}`;

          if (!transientStatuses.has(response.status)) {
            throw new NonRetryableScannerError(lastError);
          }
        }
      }
    } catch (error) {
      if (error instanceof NonRetryableScannerError) throw error;
      lastError = normalizeFetchError(error);
    }

    if (attempt < options.attempts) {
      await sleep(Math.min(attempt * 1000, 3000));
    }
  }

  throw new Error(lastError);
}
