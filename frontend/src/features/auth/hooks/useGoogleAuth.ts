import { useState, useCallback } from 'react';

import { AppError, isAppError } from '../../../shared/errors';
import { performGoogleOAuthFlow, type GoogleOAuthResult } from '../googleAuth';

export interface UseGoogleAuthOptions {
  onSuccess?: (idToken: string) => void | Promise<void>;
  onError?: (error: AppError) => void;
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
          const appError = isAppError(err)
            ? err
            : new AppError({
                kind: 'http',
                code: 'INTERNAL_ERROR',
                status: 500,
                retryable: false,
              });
          options.onError?.(appError);
          return { type: 'error', error: appError };
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
