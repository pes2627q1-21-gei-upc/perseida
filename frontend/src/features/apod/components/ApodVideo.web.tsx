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
 * The admin CSP (`frame-src`) limits which hosts may be framed.
 */
export function ApodVideo({ url, label, onError }: Props) {
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
