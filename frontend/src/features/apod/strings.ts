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
