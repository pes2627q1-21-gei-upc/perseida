import type { TFunction } from 'i18next';

/** Stable code convention (cataleg-codis.md). Anything else never reaches the translation lookup. */
const CODE_FORMAT = /^[A-Z][A-Z0-9_]*$/;

/**
 * User-facing text for an error code (ADR-0018): `errors.<CODE>`, or a generic message if
 * that code has no text. The server `detail` never takes part. A generic message that
 * invites a retry is only used when the error is retryable.
 */
export function errorMessage(t: TFunction, code: string, retryable: boolean): string {
  const generic = retryable ? 'errors.INTERNAL_ERROR' : 'errors.GENERIC_FINAL';
  // A code outside the convention (e.g. "constructor") would otherwise match inherited properties.
  return t(CODE_FORMAT.test(code) ? [`errors.${code}`, generic] : generic);
}
