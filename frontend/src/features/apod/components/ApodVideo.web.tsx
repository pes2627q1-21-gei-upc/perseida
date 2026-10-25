import { useEffect } from 'react';

import { hostOf } from '../../../shared/security/safeUrl';

/**
 * Hosts that may be framed: keep in sync with `frame-src` in
 * `infra/nginx-proxy-manager/security-headers.conf`. Checked here as well because an iframe
 * with `allow-scripts allow-same-origin` escapes its sandbox if it is served from our own
 * origin, and `onError` never fires for a frame the CSP blocks.
 */
const ALLOWED_VIDEO_HOSTS = ['www.youtube.com', 'apod.nasa.gov'];

interface Props {
  /** Plain https URL of the video (already checked by the caller with `safeHttpsUrl`). */
  url: string;
  label: string;
  onError: () => void;
}

/**
 * Web APOD video player (TG-327): `react-native-webview` does not exist on the web, so the
 * video goes in a sandboxed iframe. The sandbox keeps the embed from navigating the top page,
 * opening popups or submitting forms; the browser itself sends the Referer YouTube requires.
 * Only hosts in `ALLOWED_VIDEO_HOSTS` are framed; any other shows the screen's error text.
 */
export function ApodVideo({ url, label, onError }: Props) {
  const host = hostOf(url);
  const allowed = host !== undefined && ALLOWED_VIDEO_HOSTS.includes(host);

  useEffect(() => {
    if (!allowed) onError();
  }, [allowed, onError]);

  if (!allowed) return null;

  return (
    <iframe
      data-testid="apod-video"
      title={label}
      src={url}
      sandbox="allow-scripts allow-same-origin allow-presentation"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="fullscreen; picture-in-picture"
      allowFullScreen
      loading="lazy"
      onError={onError}
      style={{ width: '100%', height: '100%', border: 0 }}
    />
  );
}
