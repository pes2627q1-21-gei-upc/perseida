import { errorMessage, isAppError } from '../../shared/errors';
import i18n from '../../shared/i18n';

// Fixed texts of the sign-in and sign-out UI, grouped so TG-91 (#319) can move them to i18next (ca/es/en).
export const authStrings = {
  appName: 'Perseida',
  tagline: 'Mira cap amunt',
  continueWithGoogle: 'Continua amb Google',
  loginUnavailable: "L'inici de sessió amb Google encara no està disponible.",
  logout: 'Tanca la sessió',
  // The device is always signed out; this tells the user when the server could not confirm it.
  logoutNotConfirmed:
    "S'ha tancat la sessió en aquest dispositiu, però no s'ha pogut confirmar al servidor.",
  logoutHint: "Tanca la sessió d'aquest dispositiu i torna a la pantalla d'inici de sessió",
} as const;

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
