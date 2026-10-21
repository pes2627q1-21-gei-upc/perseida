// Fixed texts of the sign-in and sign-out UI, grouped so TG-91 (#319) can move them to i18next (ca/es/en).
export const authStrings = {
  appName: 'Perseida',
  tagline: 'Mira cap amunt',
  continueWithGoogle: 'Continua amb Google',
  // TEMPORARY: replaced by the real flow in US #43 (see handleContinue in app/login.tsx).
  loginUnavailable: "L'inici de sessió amb Google encara no està disponible.",
  logout: 'Tanca la sessió',
  logoutHint: "Tanca la sessió d'aquest dispositiu i torna a la pantalla d'inici de sessió",
} as const;
