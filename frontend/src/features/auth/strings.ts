import { errorMessage, isAppError } from '../../shared/errors';
import i18n from '../../shared/i18n';

/**
 * Returns the localized error message for an authentication error code (ADR-0018).
 * Uses i18next via errorMessage() to support ca/es/en from locales/{ca,es,en}.json.
 * Avoids prototype pollution by verifying SCREAMING_SNAKE code format.
 */
export function authErrorMessage(code: string, retryable = true): string {
  return errorMessage(i18n.t.bind(i18n), code, retryable);
}

/**
 * Converts any caught error into a safe, localized user-facing message (ADR-0018).
 * Never leaks raw server details, traces, or technical error messages.
 * Maps only stable AppError instances and falls back safely to INTERNAL_ERROR without text heuristics.
 */
export function toAuthErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return authErrorMessage(error.code, error.retryable);
  }
  return authErrorMessage('INTERNAL_ERROR', true);
}
