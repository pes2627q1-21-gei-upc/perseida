import { hostOf, safeHttpsUrl } from './safeUrl';

describe('safeHttpsUrl', () => {
  it.each([
    'https://apod.nasa.gov/apod/image/2610/orion.jpg',
    'https://www.youtube.com/embed/abc123?rel=0&autoplay=0',
    'https://lh3.googleusercontent.com/a/abc=s96-c',
    'https://example.test:8443/path#fragment',
    'HTTPS://EXAMPLE.TEST/A',
  ])('accepts the plain https link %s', (url) => {
    expect(safeHttpsUrl(url)).toBe(url);
  });

  it('trims the blanks around a valid link', () => {
    expect(safeHttpsUrl('  https://example.test/a.png \n')).toBe('https://example.test/a.png');
  });

  it.each([
    ['javascript scheme', 'javascript:alert(document.cookie)'],
    ['mixed-case javascript', 'JaVaScRiPt:alert(1)'],
    ['javascript with a tab inside', 'java\tscript:alert(1)'],
    ['data URL', 'data:text/html;base64,PHNjcmlwdD4='],
    ['plain http', 'http://example.test/a.png'],
    ['android intent', 'intent://scan/#Intent;scheme=zxing;end'],
    ['file URL', 'file:///etc/passwd'],
    ['protocol-relative', '//example.test/a.png'],
    ['credentials in the URL', 'https://user:pass@example.test/a.png'],
    ['credentials trick', 'https://example.test@evil.test/a.png'],
    ['backslash host trick', 'https://example.test\\@evil.test/'],
    ['no host', 'https:///a.png'],
    ['blank inside', 'https://exam ple.test/a.png'],
    ['NUL inside', 'https://example.test/a\u0000.png'],
    ['newline inside', 'https://example.test/a\n.png'],
    ['empty', ''],
    ['only blanks', '   '],
    ['too long', `https://example.test/${'a'.repeat(2100)}`],
  ])('refuses %s', (_name, url) => {
    expect(safeHttpsUrl(url)).toBeNull();
  });

  it.each([null, undefined])('refuses %s', (url) => {
    expect(safeHttpsUrl(url)).toBeNull();
  });
});

describe('hostOf', () => {
  it('returns the lower-cased host with its port', () => {
    expect(hostOf('https://WWW.YouTube.com:443/embed/x?y=1')).toBe('www.youtube.com:443');
  });

  it('returns undefined for a URL without an http(s) scheme', () => {
    expect(hostOf('javascript:alert(1)')).toBeUndefined();
  });
});
