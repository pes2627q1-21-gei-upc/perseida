import { Linking } from 'react-native';
import type { WebViewProps } from 'react-native-webview';

import { safeHttpsUrl } from '../security/safeUrl';

type ShouldStartLoadRequest = Parameters<
  NonNullable<WebViewProps['onShouldStartLoadWithRequest']>
>[0];

/**
 * The WebView only shows the map page itself (loaded from a string, so `about:blank`).
 * Links on the map (the tile attribution) open in the system browser if they are plain https;
 * anything else is blocked without leaving the app.
 */
export function onlyMapPage(request: ShouldStartLoadRequest): boolean {
  if (request.url === 'about:blank') return true;
  const link = safeHttpsUrl(request.url);
  if (link) Linking.openURL(link).catch(() => undefined);
  return false;
}
