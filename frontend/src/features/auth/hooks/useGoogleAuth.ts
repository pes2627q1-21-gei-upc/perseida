import { useState, useCallback } from 'react';

import { performGoogleOAuthFlow, type GoogleOAuthResult } from '../googleAuth';

export interface UseGoogleAuthOptions {
  onSuccess?: (idToken: string) => void | Promise<void>;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}

/**
 * Hook for initiating Google OAuth2 + PKCE flow in React Native components.
 * Manages active authentication state and triggers optional callbacks.
 */
export function useGoogleAuth(options: UseGoogleAuthOptions = {}) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const signIn = useCallback(async (): Promise<GoogleOAuthResult> => {
    setIsAuthenticating(true);
    try {
      const result = await performGoogleOAuthFlow();
      if (result.type === 'success') {
        try {
          await options.onSuccess?.(result.idToken);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          options.onError?.(error);
          return { type: 'error', error };
        }
      } else if (result.type === 'cancel') {
        options.onCancel?.();
      } else if (result.type === 'error') {
        options.onError?.(result.error);
      }
      return result;
    } finally {
      setIsAuthenticating(false);
    }
  }, [options]);

  return {
    signIn,
    isAuthenticating,
  };
}
