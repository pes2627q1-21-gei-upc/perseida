// Links that come from the API or from a third party (APOD media, avatars, anything a
// server or a remote page hands us) are only used if they are plain https. Everything else
// (`javascript:`, `data:`, `http:`, `intent:`, `file:`, credentials in the URL) is refused
// before it reaches an <Image>, a WebView or Linking.openURL.

const MAX_URL_LENGTH = 2048;
// https://<host[:port]>[/path][?query][#fragment]: no blanks, no `@` before the path (credentials).
const HTTPS_URL = /^https:\/\/[^\s/?#@\\]+(?:[/?#]\S*)?$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** The URL if it is a plain https link, else null. */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return null;
  if (CONTROL_CHARACTERS.test(trimmed)) return null;
  return HTTPS_URL.test(trimmed) ? trimmed : null;
}

/** Host of an http(s) URL, without depending on the URL polyfill (incomplete in React Native). */
export function hostOf(url: string): string | undefined {
  return /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase();
}
