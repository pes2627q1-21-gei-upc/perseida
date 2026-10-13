export type AppErrorKind = 'http' | 'network';

export interface FieldError {
  field: string;
  message: string;
  type: string;
}

export interface AppErrorInit {
  kind: AppErrorKind;
  /** Stable error code (e.g. EVENT_NOT_FOUND). The UI translates it; it never shows raw text. */
  code: string;
  status?: number;
  correlationId?: string;
  fieldErrors?: FieldError[];
  retryable: boolean;
}

/**
 * Error the UI can rely on (gestio-errors skill). It deliberately does not keep the
 * server `detail`: that text is technical and must never reach the user.
 */
export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly code: string;
  readonly status?: number;
  readonly correlationId?: string;
  readonly fieldErrors?: FieldError[];
  readonly retryable: boolean;

  constructor(init: AppErrorInit) {
    super(init.code);
    this.name = 'AppError';
    this.kind = init.kind;
    this.code = init.code;
    this.status = init.status;
    this.correlationId = init.correlationId;
    this.fieldErrors = init.fieldErrors;
    this.retryable = init.retryable;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
