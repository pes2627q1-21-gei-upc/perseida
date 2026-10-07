// Hook SessionStart: injecta l'índex i l'estat actual del vault.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

const HEADER =
  'Context del vault de Perseida (autogenerat). Abans de treballar, segueix AGENTS.md i la skill vault-context.';

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/, '');
}

export function buildContext(vaultDir, { maxChars = 6000 } = {}) {
  const parts = [HEADER];
  const index = join(vaultDir, '00-index.md');
  if (!existsSync(index)) {
    return `${HEADER}\nEl vault és sense índex (00-index.md no existeix).`;
  }
  parts.push(stripFrontmatter(readFileSync(index, 'utf8')).trim());
  const estat = join(vaultDir, 'estat', 'estat-actual.md');
  parts.push(
    existsSync(estat)
      ? stripFrontmatter(readFileSync(estat, 'utf8')).trim()
      : 'estat/estat-actual.md no trobat.',
  );
  const full = parts.join('\n\n');
  return full.length > maxChars ? full.slice(0, maxChars) + '\n… (truncat)' : full;
}

if (isMain(import.meta.url)) {
  let additionalContext;
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    additionalContext = buildContext(join(root, 'obsidian_vault'));
  } catch (e) {
    additionalContext = `No s'ha pogut llegir el vault: ${e.message}`;
  }
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }),
  );
}
