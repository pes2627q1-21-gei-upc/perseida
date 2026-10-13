import { jsonResponse, problemResponse } from '../../../__mocks__/apod';
import { AppError, isAppError } from './AppError';
import { NETWORK_ERROR_CODE, networkError, toAppError } from './toAppError';

describe('toAppError', () => {
  it('keeps code, status and correlation id from a problem+json response', async () => {
    const error = await toAppError(problemResponse(404, 'EVENT_NOT_FOUND'));

    expect(error).toBeInstanceOf(AppError);
    expect(error.kind).toBe('http');
    expect(error.code).toBe('EVENT_NOT_FOUND');
    expect(error.status).toBe(404);
    expect(error.correlationId).toBe('5c0e0b8e-6d57-4f7b-9d0e-0d6a1f6f4c11');
  });

  it('never exposes the technical detail of the server', async () => {
    const error = await toAppError(problemResponse(500, 'INTERNAL_ERROR'));

    expect(error.message).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(error)).not.toContain('technical detail');
  });

  it('maps per-field validation errors and drops malformed entries', async () => {
    const error = await toAppError(
      problemResponse(422, 'VALIDATION_ERROR', {
        errors: [{ field: 'name', message: 'Field required', type: 'missing' }, { field: 1 }, 'x'],
      }),
    );

    expect(error.fieldErrors).toEqual([
      { field: 'name', message: 'Field required', type: 'missing' },
    ]);
  });

  it('falls back to HTTP_<status> when the body is not a problem', async () => {
    const error = await toAppError(new Response('<html>bad gateway</html>', { status: 502 }));

    expect(error.code).toBe('HTTP_502');
    expect(error.correlationId).toBeUndefined();
  });

  it('falls back to HTTP_<status> when the JSON body is malformed or has no code', async () => {
    const broken = new Response('{not json', {
      status: 500,
      headers: { 'content-type': 'application/problem+json' },
    });

    expect((await toAppError(broken)).code).toBe('HTTP_500');
    expect((await toAppError(jsonResponse({ code: '' }, 400))).code).toBe('HTTP_400');
    expect((await toAppError(jsonResponse(['x'], 400))).code).toBe('HTTP_400');
  });

  it.each([
    [400, false],
    [401, false],
    [404, false],
    [408, true],
    [422, false],
    [429, true],
    [500, true],
    [503, true],
  ])('marks status %i as retryable=%s', async (status, retryable) => {
    const error = await toAppError(problemResponse(status, 'ANY_CODE'));

    expect(error.retryable).toBe(retryable);
  });
});

describe('networkError', () => {
  it('is a retryable network AppError without status', () => {
    const error = networkError();

    expect(error.kind).toBe('network');
    expect(error.code).toBe(NETWORK_ERROR_CODE);
    expect(error.status).toBeUndefined();
    expect(error.retryable).toBe(true);
    expect(isAppError(error)).toBe(true);
  });

  it('isAppError rejects other values', () => {
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});
