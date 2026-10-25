import { AppError, networkError } from '../../shared/errors';
import { authErrorMessage, toAuthErrorMessage } from './strings';

describe('Auth error messages mapping', () => {
  it('maps INVALID_GOOGLE_TOKEN (401) to approved catalog text', () => {
    expect(authErrorMessage('INVALID_GOOGLE_TOKEN')).toBe(
      'No hem pogut verificar el teu compte de Google. Torna a iniciar sessió.',
    );
  });

  it('maps ACCOUNT_SUSPENDED (403) to approved catalog text', () => {
    expect(authErrorMessage('ACCOUNT_SUSPENDED')).toBe('El teu compte està suspès.');
  });

  it('maps ACCOUNT_DELETED (403) to approved catalog text', () => {
    expect(authErrorMessage('ACCOUNT_DELETED')).toBe("Aquest compte s'ha eliminat.");
  });

  it('maps EMAIL_ALREADY_REGISTERED (409) to approved catalog text', () => {
    expect(authErrorMessage('EMAIL_ALREADY_REGISTERED')).toBe(
      'Aquest correu ja està associat a un altre compte.',
    );
  });

  it('maps IDENTITY_PROVIDER_UNAVAILABLE (503) to approved catalog text', () => {
    expect(authErrorMessage('IDENTITY_PROVIDER_UNAVAILABLE')).toBe(
      "Google no està disponible ara mateix. Torna-ho a provar d'aquí a una estona.",
    );
  });

  it('maps SESSION_UNAVAILABLE (503) to approved catalog text', () => {
    expect(authErrorMessage('SESSION_UNAVAILABLE')).toBe(
      "No podem comprovar la teva sessió ara mateix. Torna-ho a provar d'aquí a una estona.",
    );
  });

  it('maps NETWORK_ERROR to approved catalog text', () => {
    expect(authErrorMessage('NETWORK_ERROR')).toBe(
      'No hi ha connexió. Comprova la xarxa i torna-ho a provar.',
    );
  });

  it('maps INVALID_SESSION to approved catalog text', () => {
    expect(authErrorMessage('INVALID_SESSION')).toBe(
      'La teva sessió ha caducat. Torna a iniciar sessió.',
    );
  });

  it('falls back to generic message for unknown error codes', () => {
    expect(authErrorMessage('SOME_RANDOM_CODE')).toBe(
      'Alguna cosa ha anat malament. Torna-ho a provar.',
    );
  });

  it('safely handles inherited object properties without leaking functions', () => {
    expect(authErrorMessage('constructor')).toBe(
      'Alguna cosa ha anat malament. Torna-ho a provar.',
    );
    expect(authErrorMessage('toString')).toBe('Alguna cosa ha anat malament. Torna-ho a provar.');
    expect(authErrorMessage('valueOf')).toBe('Alguna cosa ha anat malament. Torna-ho a provar.');
  });

  describe('toAuthErrorMessage helper', () => {
    it('converts AppError with known code to the corresponding message', () => {
      const err = new AppError({
        kind: 'http',
        code: 'INVALID_GOOGLE_TOKEN',
        status: 401,
        retryable: true,
      });
      expect(toAuthErrorMessage(err)).toBe(
        'No hem pogut verificar el teu compte de Google. Torna a iniciar sessió.',
      );
    });

    it('converts AppError with conflict code (409) to corresponding message', () => {
      const err = new AppError({
        kind: 'http',
        code: 'EMAIL_ALREADY_REGISTERED',
        status: 409,
        retryable: false,
      });
      expect(toAuthErrorMessage(err)).toBe('Aquest correu ja està associat a un altre compte.');
    });

    it('converts network failures (networkError) to NETWORK_ERROR text', () => {
      const networkErr = networkError();
      expect(toAuthErrorMessage(networkErr)).toBe(
        'No hi ha connexió. Comprova la xarxa i torna-ho a provar.',
      );
    });

    it('never leaks raw technical error details from unknown exceptions and falls back safely', () => {
      const sensitiveErr = new Error('SyntaxError: Unexpected token in JSON at position 42');
      expect(toAuthErrorMessage(sensitiveErr)).toBe(
        'Alguna cosa ha anat malament. Torna-ho a provar.',
      );
    });
  });
});
