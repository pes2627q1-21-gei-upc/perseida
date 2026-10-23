import { renderHook, act } from '@testing-library/react-native';

import * as googleAuthModule from '../googleAuth';
import { useGoogleAuth } from './useGoogleAuth';

describe('useGoogleAuth hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('TG-43 Criteri 1: manages isAuthenticating and triggers onSuccess upon successful authentication', async () => {
    jest.spyOn(googleAuthModule, 'performGoogleOAuthFlow').mockResolvedValueOnce({
      type: 'success',
      idToken: 'mock-id-token-abc',
    });

    const onSuccess = jest.fn();
    const { result } = await renderHook(() => useGoogleAuth({ onSuccess }));

    expect(result.current.isAuthenticating).toBe(false);

    let response: googleAuthModule.GoogleOAuthResult | undefined;
    await act(async () => {
      response = await result.current.signIn();
    });

    expect(response).toEqual({ type: 'success', idToken: 'mock-id-token-abc' });
    expect(onSuccess).toHaveBeenCalledWith('mock-id-token-abc');
    expect(result.current.isAuthenticating).toBe(false);
  });

  it('TG-43 Criteri 5: catches error thrown in onSuccess, routes it to onError, and resets isAuthenticating', async () => {
    jest.spyOn(googleAuthModule, 'performGoogleOAuthFlow').mockResolvedValueOnce({
      type: 'success',
      idToken: 'mock-id-token-abc',
    });

    const failure = new Error('Backend rejected token');
    const onSuccess = jest.fn().mockRejectedValueOnce(failure);
    const onError = jest.fn();

    const { result } = await renderHook(() => useGoogleAuth({ onSuccess, onError }));

    await act(async () => {
      await result.current.signIn();
    });

    expect(onSuccess).toHaveBeenCalledWith('mock-id-token-abc');
    expect(onError).toHaveBeenCalledWith(failure);
    expect(result.current.isAuthenticating).toBe(false);
  });

  it('TG-43 Criteri 5: calls onCancel callback when user cancels the flow', async () => {
    jest.spyOn(googleAuthModule, 'performGoogleOAuthFlow').mockResolvedValueOnce({
      type: 'cancel',
    });

    const onCancel = jest.fn();
    const { result } = await renderHook(() => useGoogleAuth({ onCancel }));

    await act(async () => {
      await result.current.signIn();
    });

    expect(onCancel).toHaveBeenCalled();
    expect(result.current.isAuthenticating).toBe(false);
  });

  it('TG-43 Criteri 5: calls onError callback when flow fails', async () => {
    const error = new Error('OAuth flow failed');
    jest.spyOn(googleAuthModule, 'performGoogleOAuthFlow').mockResolvedValueOnce({
      type: 'error',
      error,
    });

    const onError = jest.fn();
    const { result } = await renderHook(() => useGoogleAuth({ onError }));

    await act(async () => {
      await result.current.signIn();
    });

    expect(onError).toHaveBeenCalledWith(error);
    expect(result.current.isAuthenticating).toBe(false);
  });
});
