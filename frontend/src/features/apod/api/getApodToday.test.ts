import { apodImage, jsonResponse } from '../../../../__mocks__/apod';
import { AppError } from '../../../shared/errors';
import { getApodToday } from './getApodToday';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getApodToday', () => {
  it('returns the APOD of the contract', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodImage));

    await expect(getApodToday()).resolves.toEqual(apodImage);
  });

  it('rejects with a non-retryable AppError when a 200 comes without a body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));

    const failure = await getApodToday().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', status: 200, retryable: false });
  });
});
