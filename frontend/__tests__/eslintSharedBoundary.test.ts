/**
 * @jest-environment node
 */
// TG-654 F7: shared/ does not depend on any feature (ADR-0030; the session reaches the shared
// connection through SocketAuth). ESLint enforces it with no-restricted-imports on src/shared/**.

// @types/node is not a dependency: only what the test uses.
interface SpawnResult {
  stdout: string;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawnSync } = require('child_process') as {
  spawnSync: (
    command: string,
    args: string[],
    options: { cwd: string; input: string; encoding: 'utf8' },
  ) => SpawnResult;
};

interface LintMessage {
  ruleId: string | null;
  severity: number;
}

// Jest runs from the frontend root (where .eslintrc.js lives). ESLint runs in its own process:
// loaded inside Jest, Expo's polyfills (structuredClone) break its start-up.
const ROOT = process.cwd();
const ESLINT_BIN = `${ROOT}/node_modules/eslint/bin/eslint.js`;

/** The no-restricted-imports problems ESLint reports for `code` as if it lived in `file`. */
function restrictedImports(file: string, code: string): LintMessage[] {
  const run = spawnSync(
    process.execPath,
    [ESLINT_BIN, '--stdin', '--stdin-filename', file, '--format', 'json'],
    { cwd: ROOT, input: code, encoding: 'utf8' },
  );
  const [result] = JSON.parse(run.stdout) as { messages: LintMessage[] }[];
  return (result?.messages ?? []).filter((message) => message.ruleId === 'no-restricted-imports');
}

const FEATURE_IMPORT =
  "import { socketAuth } from '../features/auth/socketAuth';\n\nexport { socketAuth };\n";

describe('ESLint: shared/ no importa de features/ (TG-654)', () => {
  it.each([
    ['src/shared/x.ts', "import { socketAuth } from '../features/auth/socketAuth';\n"],
    ['src/shared/realtime/x.ts', "import { socketAuth } from '../../features/auth/socketAuth';\n"],
    ['src/shared/ui/x.tsx', "import { useQuiz } from '../../features/quiz/hooks/useQuiz';\n"],
    ['src/shared/x.ts', "export { socketAuth } from '../features/auth/socketAuth';\n"],
  ])('%s: «%s» falla amb no-restricted-imports', (file, code) => {
    const problems = restrictedImports(file, code);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.severity).toBe(2);
  });

  it('un fitxer de features/ sí que pot importar d’una altra feature i de shared', () => {
    const code = `${FEATURE_IMPORT.replace('../features/auth', '../../auth')}import { config } from '../../../shared/config';\n\nexport { config };\n`;

    expect(restrictedImports('src/features/chat/hooks/x.ts', code)).toEqual([]);
  });

  it('un fitxer de shared/ pot importar d’un altre fitxer de shared/', () => {
    const code = "import { config } from '../config';\n\nexport { config };\n";

    expect(restrictedImports('src/shared/realtime/x.ts', code)).toEqual([]);
  });
});
