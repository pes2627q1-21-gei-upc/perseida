import { AppError, type FieldError } from './AppError';

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

// Assumption pending the code catalogue: transient statuses are worth retrying; the rest are not.
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isFieldError(value: unknown): value is FieldError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.field === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.type === 'string'
  );
}

async function readProblemBody(response: Response): Promise<Record<string, unknown> | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) return undefined;
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Converts a non-ok response (RFC 9457 problem+json when available) into an AppError. */
export async function toAppError(response: Response): Promise<AppError> {
  const problem = await readProblemBody(response);
  const code =
    typeof problem?.code === 'string' && problem.code.length > 0
      ? problem.code
      : `HTTP_${response.status}`;
  const correlationId =
    typeof problem?.correlation_id === 'string' ? problem.correlation_id : undefined;
  const fieldErrors = Array.isArray(problem?.errors)
    ? problem.errors.filter(isFieldError)
    : undefined;

  return new AppError({
    kind: 'http',
    code,
    status: response.status,
    correlationId,
    fieldErrors,
    retryable: isRetryableStatus(response.status),
  });
}

/** Network failures and timeouts: there is no response, the user can try again. */
export function networkError(): AppError {
  return new AppError({ kind: 'network', code: NETWORK_ERROR_CODE, retryable: true });
}
