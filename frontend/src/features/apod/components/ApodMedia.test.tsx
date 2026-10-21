import { render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { apodImage, apodVideo } from '../../../../__mocks__/apod';
import { apodStrings } from '../strings';
import { ApodMedia, keepInPlayer } from './ApodMedia';

// The native WebView does not run under Jest: a plain View keeps its props for the assertions.
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: View };
});

const UNSAFE_URLS = [
  'javascript:alert(document.cookie)',
  'data:text/html;base64,PHNjcmlwdD4=',
  'http://apod.nasa.gov/apod/image/orion.jpg',
  'file:///etc/passwd',
  'https://user:pass@apod.nasa.gov/a.jpg',
];

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ApodMedia: URLs that come from the API', () => {
  it.each(UNSAFE_URLS)('does not load the image %s: it shows the error text', async (url) => {
    await render(<ApodMedia apod={{ ...apodImage, url }} />);

    expect(screen.queryByTestId('apod-image')).not.toBeOnTheScreen();
    expect(screen.getByText(apodStrings.mediaError)).toBeOnTheScreen();
  });

  it.each(UNSAFE_URLS)('does not open the player for the video %s', async (url) => {
    await render(<ApodMedia apod={{ ...apodVideo, url }} />);

    expect(screen.queryByTestId('apod-video')).not.toBeOnTheScreen();
    expect(screen.getByText(apodStrings.mediaError)).toBeOnTheScreen();
  });

  it('loads a plain https image', async () => {
    await render(<ApodMedia apod={apodImage} />);

    expect(screen.getByTestId('apod-image').props.source).toEqual({ uri: apodImage.url });
  });

  it('opens the player with the hardened WebView settings', async () => {
    await render(<ApodMedia apod={apodVideo} />);

    const player = screen.getByTestId('apod-video');
    expect(player.props.originWhitelist).toEqual(['https://*']);
    expect(player.props.mixedContentMode).toBe('never');
    expect(player.props.allowFileAccess).toBe(false);
    expect(player.props.allowUniversalAccessFromFileURLs).toBe(false);
    expect(player.props.thirdPartyCookiesEnabled).toBe(false);
    expect(player.props.setSupportMultipleWindows).toBe(false);
  });
});

describe('keepInPlayer: links that leave the player', () => {
  const video = 'https://www.youtube.com/embed/abc123';
  const request = (url: string) =>
    ({ url, isTopFrame: true }) as Parameters<typeof keepInPlayer>[0];

  it('hands only https links to the system browser', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    keepInPlayer(request('http://evil.example/page'), video);
    keepInPlayer(request('javascript:alert(1)'), video);
    keepInPlayer(request('https://user:pass@evil.example/page'), video);

    expect(openURL).not.toHaveBeenCalled();
  });

  it('still opens a plain https link outside the player', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    expect(keepInPlayer(request('https://evil.example/page'), video)).toBe(false);

    expect(openURL).toHaveBeenCalledWith('https://evil.example/page');
  });
});
