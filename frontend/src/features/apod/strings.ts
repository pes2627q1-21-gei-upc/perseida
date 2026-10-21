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
};

const GENERIC_ERROR_MESSAGE = 'Alguna cosa ha anat malament. Torna-ho a provar.';

/** User-facing message for an error code; unknown codes get the generic INTERNAL_ERROR text. */
export function apodErrorMessage(code: string): string {
  return errorMessages[code] ?? GENERIC_ERROR_MESSAGE;
}
