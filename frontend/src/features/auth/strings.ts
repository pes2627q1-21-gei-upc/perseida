import { isAppError } from '../../shared/errors';

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

// Error texts by stable code (ADR-0018, cataleg-codis.md). The server `detail` is never shown.
const authErrorMessages: Record<string, string> = {
  INVALID_GOOGLE_TOKEN: 'No hem pogut verificar el teu compte de Google. Torna a iniciar sessió.',
  INVALID_SESSION: 'La teva sessió ha caducat. Torna a iniciar sessió.',
  ACCOUNT_SUSPENDED: 'El teu compte està suspès.',
  ACCOUNT_DELETED: "Aquest compte s'ha eliminat.",
  EMAIL_ALREADY_REGISTERED: 'Aquest correu ja està associat a un altre compte.',
  IDENTITY_PROVIDER_UNAVAILABLE:
    "Google no està disponible ara mateix. Torna-ho a provar d'aquí a una estona.",
  SESSION_UNAVAILABLE:
    "No podem comprovar la teva sessió ara mateix. Torna-ho a provar d'aquí a una estona.",
  NETWORK_ERROR: 'No hi ha connexió. Comprova la xarxa i torna-ho a provar.',
  INTERNAL_ERROR: 'Alguna cosa ha anat malament. Torna-ho a provar.',
};

const GENERIC_ERROR_MESSAGE = 'Alguna cosa ha anat malament. Torna-ho a provar.';

/**
 * Returns the localized error message for an authentication error code.
 * Falls back to the generic error message for unknown codes (ADR-0018).
 */
export function authErrorMessage(code: string): string {
  return authErrorMessages[code] ?? GENERIC_ERROR_MESSAGE;
}

/**
 * Converts any caught error into a safe, localized user-facing message.
 * Never leaks raw server details, traces, or technical error messages.
 */
export function toAuthErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return authErrorMessage(error.code);
  }
  if (error instanceof Error) {
    if (error.message in authErrorMessages) {
      return authErrorMessage(error.message);
    }
    const lower = error.message.toLowerCase();
    if (
      lower.includes('network') ||
      lower.includes('fetch') ||
      lower.includes('timeout') ||
      lower.includes('abort') ||
      lower.includes('offline')
    ) {
      return authErrorMessage('NETWORK_ERROR');
    }
    const code = (error as { code?: string }).code;
    if (code && typeof code === 'string') {
      return authErrorMessage(code);
    }
  }
  return authErrorMessage('INTERNAL_ERROR');
}
