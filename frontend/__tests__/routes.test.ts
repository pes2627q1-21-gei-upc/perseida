// Expo Router turns every file in src/app into a route and bundles it. A test file there
// drags Jest and Testing Library into the app bundle and the bundler answers 500 (this
// broke the first run on a phone). Tests live next to the feature, not in src/app.

// Node modules, typed by hand: the app has no @types/node.
type Entry = { name: string; isDirectory: () => boolean };
const { readdirSync } = jest.requireActual<{
  readdirSync: (path: string, options: { withFileTypes: true }) => Entry[];
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');
const frontendDir = (process as unknown as { cwd: () => string }).cwd();

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe('src/app (Expo Router routes)', () => {
  it('has no test, mock or fixture files: they would be bundled as routes', () => {
    const offenders = filesUnder(join(frontendDir, 'src/app')).filter((file) =>
      /\.(test|spec)\.[jt]sx?$|__mocks__|__tests__/.test(file),
    );

    expect(offenders).toEqual([]);
  });
});
