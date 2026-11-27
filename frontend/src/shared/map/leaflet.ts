/**
 * Leaflet 1.9.4 from unpkg, pinned with subresource integrity: the hashes are those of the
 * files in the `leaflet@1.9.4` npm package, so a changed file on the CDN does not load.
 */
export const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
export const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
export const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';

/** JSON that is safe inside a <script>: `<` can never start `</script>` or a comment. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function attribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
