import createClient, { type Middleware } from 'openapi-fetch';

import { config } from '../config';
import { networkError, toAppError } from '../errors';
import type { paths } from './schema';

/** fetch with a timeout. It resolves `globalThis.fetch` at call time so tests can replace it. */
export function fetchWithTimeout(timeoutMs: number): typeof globalThis.fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await globalThis.fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Turns problem+json responses and network failures into AppError. */
export const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return undefined;
    throw await toAppError(response);
  },
  onError() {
    return networkError();
  },
};

export function createApiClient(baseUrl: string, timeoutMs: number = config.requestTimeoutMs) {
  // Fail fast: without a base URL every request would die with an obscure URL parse error.
  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not defined');
  }
  const client = createClient<paths>({ baseUrl, fetch: fetchWithTimeout(timeoutMs) });
  client.use(errorMiddleware);
  return client;
}

// Single instance shared by every feature.
export const api = createApiClient(config.apiBaseUrl);
