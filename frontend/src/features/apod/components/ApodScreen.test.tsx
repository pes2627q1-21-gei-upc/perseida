import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { apodImage, apodVideo, jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import ApodScreen from '../../../app/(app)/apod';
import i18n from '../../../shared/i18n';
import { formatApodDate } from '../formatApodDate';
import { apodKeys } from '../hooks/useApodToday';
import { keepInPlayer, PLAYER_REFERER } from './ApodVideo';

// The native WebView does not run under Jest: a plain View keeps its props for the assertions.
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: View };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const APOD_UNAVAILABLE_TEXT =
  "Ara mateix no hem pogut carregar l'APOD. Torna-ho a provar d'aquí a una estona.";
const NETWORK_ERROR_TEXT = 'No hi ha connexió. Comprova la xarxa i torna-ho a provar.';

let client: QueryClient;

async function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <ApodScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  // retryDelay 0 so the hook's single retry does not slow the tests down.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('APOD screen', () => {
  it('shows the loading state until the data arrives (criterion 4)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodImage));

    await renderScreen();

    expect(screen.getByLabelText("Carregant l'APOD")).toBeTruthy();
    expect(await screen.findByText(apodImage.title)).toBeTruthy();
    expect(screen.queryByLabelText("Carregant l'APOD")).toBeNull();
  });

  it('shows the title, date, explanation and copyright of the APOD (criterion 1)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodImage));

    await renderScreen();

    expect(await screen.findByRole('header', { name: apodImage.title })).toBeTruthy();
    expect(screen.getByText(formatApodDate(apodImage.date, 'ca'))).toBeTruthy();
    expect(screen.getByText(apodImage.explanation)).toBeTruthy();
    expect(screen.getByText(`© ${apodImage.copyright}`)).toBeTruthy();
  });

  it('hides the copyright line when the APOD has no copyright (criterion 1)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodVideo));

    await renderScreen();

    expect(await screen.findByText(apodVideo.explanation)).toBeTruthy();
    expect(screen.queryByText(/©/)).toBeNull();
  });

  it('renders an image APOD as an image without cropping (criterion 2)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodImage));

    await renderScreen();

    const image = await screen.findByTestId('apod-image');
    expect(image.props.source).toEqual({ uri: apodImage.url });
    expect(image.props.resizeMode).toBe('contain');
    expect(image.props.accessibilityLabel).toBe(apodImage.title);
    expect(screen.queryByTestId('apod-video')).toBeNull();
  });

  it('adapts the image frame to the real proportions once it loads (criterion 2)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodImage));
    await renderScreen();
    const image = await screen.findByTestId('apod-image');

    await fireEvent(image, 'load', { nativeEvent: { source: { width: 1000, height: 2000 } } });

    expect(screen.getByTestId('apod-image')).toHaveStyle({ aspectRatio: 0.5 });
  });

  it('renders a video APOD in an embedded player (criterion 3)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodVideo));

    await renderScreen();

    const player = await screen.findByTestId('apod-video');
    expect(player.props.source).toEqual({
      uri: apodVideo.url,
      headers: { Referer: PLAYER_REFERER },
    });
    expect(player.props.accessibilityLabel).toBe(`Vídeo de l'APOD: ${apodVideo.title}`);
    expect(screen.queryByTestId('apod-image')).toBeNull();
  });

  it('shows the catalogue message for the backend code, never the technical detail (criterion 5)', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(503, 'APOD_UNAVAILABLE'));
    // jest-expo runs as iOS, where the error is announced explicitly.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await renderScreen();

    expect(await screen.findByText(APOD_UNAVAILABLE_TEXT)).toBeTruthy();
    expect(screen.queryByText(/technical detail/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Torna-ho a provar' })).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(APOD_UNAVAILABLE_TEXT);
  });

  it('shows the network message when there is no connection (criterion 5)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });

    await renderScreen();

    expect(await screen.findByText(NETWORK_ERROR_TEXT)).toBeTruthy();
  });

  it.each([
    [
      'es',
      'Cargando el APOD',
      'No hay conexión. Comprueba la red e inténtalo de nuevo.',
      'Vuelve a intentarlo',
    ],
    ['en', 'Loading the APOD', 'No connection. Check your network and try again.', 'Try again'],
  ])('shows loading, error and retry in %s', async (language, loading, message, retry) => {
    await i18n.changeLanguage(language);
    try {
      jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        throw new TypeError('Network request failed');
      });

      await renderScreen();

      expect(screen.getByLabelText(loading)).toBeTruthy();
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByRole('button', { name: retry })).toBeTruthy();
    } finally {
      // The screen is still mounted: changing the language re-renders it.
      await act(() => i18n.changeLanguage('ca'));
    }
  });

  it('retries from the error state, showing loading and then the content (criterion 5)', async () => {
    let answer: () => void = () => undefined;
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      // The hook retries a 503 once on its own before showing the error.
      .mockImplementationOnce(async () => problemResponse(503, 'APOD_UNAVAILABLE'))
      .mockImplementationOnce(async () => problemResponse(503, 'APOD_UNAVAILABLE'))
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (answer = () => resolve(jsonResponse(apodImage)))),
      );
    await renderScreen();
    const retry = await screen.findByRole('button', { name: 'Torna-ho a provar' });

    await fireEvent.press(retry);

    expect(await screen.findByLabelText("Carregant l'APOD")).toBeTruthy();
    answer();
    expect(await screen.findByText(apodImage.title)).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does not offer a retry for a non-retryable error (gestio-errors)', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(404, 'NOT_FOUND'));

    await renderScreen();

    expect(await screen.findByText("No s'ha trobat el que busques.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
  });

  it('does not invite a retry for a non-retryable error without its own text (gestio-errors)', async () => {
    // A 200 without a body is INVALID_RESPONSE, which is not retryable.
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));

    await renderScreen();

    expect(
      await screen.findByText("Alguna cosa ha anat malament. No s'ha pogut carregar el contingut."),
    ).toBeTruthy();
    expect(screen.queryByText(/Torna-ho a provar/)).toBeNull();
  });

  it('shows a message in the frame when the image cannot be loaded', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodImage));
    await renderScreen();

    await fireEvent(await screen.findByTestId('apod-image'), 'error');

    expect(screen.getByText("No s'ha pogut carregar la imatge o el vídeo.")).toBeTruthy();
    expect(screen.getByText(apodImage.title)).toBeTruthy();
  });

  it('loads the media of a new APOD after the previous one failed', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodImage));
    await renderScreen();
    await fireEvent(await screen.findByTestId('apod-image'), 'error');
    const nextApod = { ...apodImage, url: 'https://apod.nasa.gov/apod/image/m31.jpg' };

    // Same path as a later refetch (pull-to-refresh, focus): new data with the screen still open.
    client.setQueryData(apodKeys.today(), nextApod);

    expect((await screen.findByTestId('apod-image')).props.source).toEqual({ uri: nextApod.url });
    expect(screen.queryByText("No s'ha pogut carregar la imatge o el vídeo.")).toBeNull();
  });

  it('shows a message in the frame when the video cannot be loaded', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodVideo));
    await renderScreen();

    await fireEvent(await screen.findByTestId('apod-video'), 'error');

    expect(screen.getByText("No s'ha pogut carregar la imatge o el vídeo.")).toBeTruthy();
  });

  it('shows a message in the frame when the video page answers with an HTTP error', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodVideo));
    await renderScreen();

    await fireEvent(await screen.findByTestId('apod-video'), 'httpError');

    expect(screen.getByText("No s'ha pogut carregar la imatge o el vídeo.")).toBeTruthy();
  });
});

describe('keepInPlayer', () => {
  const video = 'https://www.youtube.com/embed/abc123';
  const request = (url: string, isTopFrame = true) =>
    ({ url, isTopFrame }) as Parameters<typeof keepInPlayer>[0];

  it('keeps navigation inside the video host', () => {
    expect(keepInPlayer(request('https://www.youtube.com/embed/abc123?autoplay=1'), video)).toBe(
      true,
    );
  });

  it('always loads inner frames of the player', () => {
    expect(keepInPlayer(request('https://googleads.example/frame', false), video)).toBe(true);
  });

  it('opens links to other hosts in the system browser', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    expect(keepInPlayer(request('https://evil.example/page'), video)).toBe(false);
    expect(openURL).toHaveBeenCalledWith('https://evil.example/page');
  });

  it('stays in the player when no app can open the link', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No app to open the URL'));

    expect(keepInPlayer(request('https://evil.example/page'), video)).toBe(false);
    // Lets the rejection settle: if it were not handled, Jest would fail the test.
    await Promise.resolve();
  });

  it('blocks other schemes without opening them', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    expect(keepInPlayer(request('intent://evil.example#Intent;end'), video)).toBe(false);
    expect(openURL).not.toHaveBeenCalled();
  });
});
