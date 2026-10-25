import type { TFunction } from 'i18next';

/**
 * User-facing text for an error code (ADR-0018): `errors.<CODE>`, or a generic message if
 * that code has no text. The server `detail` never takes part. A generic message that
 * invites a retry is only used when the error is retryable.
 */
export function errorMessage(t: TFunction, code: string, retryable: boolean): string {
  return t([`errors.${code}`, retryable ? 'errors.INTERNAL_ERROR' : 'errors.GENERIC_FINAL']);
}
