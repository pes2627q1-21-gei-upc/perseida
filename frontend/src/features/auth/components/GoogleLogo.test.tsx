import { render, screen } from '@testing-library/react-native';

import { GoogleLogo } from './GoogleLogo';

// Node modules, typed by hand: the app has no @types/node and a test does not justify one.
const { readFileSync } = jest.requireActual<{ readFileSync: (path: string) => Uint8Array }>('fs');
const { createHash } = jest.requireActual<{
  createHash: (algorithm: string) => {
    update: (data: Uint8Array) => { digest: (e: 'hex') => string };
  };
}>('crypto');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');
// Jest runs from the frontend directory (pnpm test).
const frontendDir = (process as unknown as { cwd: () => string }).cwd();

// SHA-256 of the files in Google's signin-assets.zip (Light, no text, circle, Android + Web),
// checked on 2026-10-21. The brand rules forbid any change to the "G": see assets/google/README.md.
const OFFICIAL_SHA256 = {
  'google-g.png': '3dcf1c957398f6a0f0800d77ac31d4b88b1825c2aaf8e5c30366aacad3b083f7',
  'google-g@2x.png': 'ea659900b78dcab746c26cfa4f7bf0bf3769b46115dcce906280c16b68d6c07c',
  'google-g@3x.png': '0d8bf62f71c8a0e9c6cb202781ef054d60c15d6b0a8f4be9a3982497578cdad9',
};

describe('GoogleLogo', () => {
  it.each(Object.entries(OFFICIAL_SHA256))(
    'ships %s byte for byte as Google distributes it',
    (file, expected) => {
      const bytes = readFileSync(join(frontendDir, 'assets/google', file));

      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
    },
  );

  it('is decorative: hidden from screen readers', async () => {
    await render(<GoogleLogo />);

    expect(screen.queryByRole('image')).not.toBeOnTheScreen();
    const root = screen.toJSON() as { props: Record<string, unknown> };
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
