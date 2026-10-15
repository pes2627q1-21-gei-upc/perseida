/**
 * Public configuration (EXPO_PUBLIC_* variables are bundled into the app: never put secrets here).
 * EXPO_PUBLIC_API_BASE_URL is the backend origin, without the /api prefix (the paths already carry it).
 */
export const config = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? '',
  /** Max time to wait for the backend before the request counts as a network error. */
  requestTimeoutMs: 10_000,
};
