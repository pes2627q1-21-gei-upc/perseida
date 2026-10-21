// Fixed texts of the APOD screen, grouped so TG-91 (#319) can move them to i18next (ca/es/en).
// Everything else on the screen (title, explanation, copyright) comes from the API.
export const apodStrings = {
  copyrightPrefix: '©',
  videoLabel: "Vídeo de l'APOD",
  mediaError: "No s'ha pogut carregar la imatge o el vídeo.",
  loadingLabel: "Carregant l'APOD",
  retry: 'Torna-ho a provar',
  retryHint: "Torna a carregar l'APOD",
} as const;

// Error texts by stable code (ADR-0018, cataleg-codis.md). The server `detail` is never shown.
const errorMessages: Record<string, string> = {
  APOD_UNAVAILABLE:
    "Ara mateix no hem pogut carregar l'APOD. Torna-ho a provar d'aquí a una estona.",
  NETWORK_ERROR: 'No hi ha connexió. Comprova la xarxa i torna-ho a provar.',
  NOT_FOUND: "No s'ha trobat el que busques.",
};

const GENERIC_ERROR_MESSAGE = 'Alguna cosa ha anat malament. Torna-ho a provar.';
/** Without a retry button the message must not invite the user to try again. */
const GENERIC_FINAL_ERROR_MESSAGE = "Alguna cosa ha anat malament. No s'ha pogut carregar l'APOD.";

/**
 * User-facing message for an error code. Codes without their own text get the generic
 * INTERNAL_ERROR text if they are retryable, or a final message that does not invite a retry.
 */
export function apodErrorMessage(code: string, retryable = true): string {
  return errorMessages[code] ?? (retryable ? GENERIC_ERROR_MESSAGE : GENERIC_FINAL_ERROR_MESSAGE);
}
