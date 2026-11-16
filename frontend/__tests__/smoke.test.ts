import { AppError, isAppError } from '../src/shared/errors';

describe('smoke test', () => {
  it('runs Jest with the jest-expo preset and TypeScript', () => {
    expect(1 + 1).toBe(2);
  });

  it('can import code from src/ (module resolution works)', () => {
    const error = new AppError({ kind: 'network', code: 'NETWORK_ERROR', retryable: true });

    expect(isAppError(error)).toBe(true);
    expect(isAppError(new Error('plain error'))).toBe(false);
  });
});
