import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildContext } from './vault-context.mjs';

function vault(files) {
  const root = mkdtempSync(join(tmpdir(), 'vault-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}

test('inclou índex i estat sense frontmatter', () => {
  const v = vault({
    '00-index.md': '---\ntitol: x\n---\n# Índex\nhola',
    'estat/estat-actual.md': '---\ntitol: y\n---\n# Estat\nsprint 1',
  });
  const out = buildContext(v);
  assert.match(out, /# Índex/);
  assert.match(out, /sprint 1/);
  assert.doesNotMatch(out, /titol:/);
  rmSync(v, { recursive: true });
});

test('indica quan falta l\'estat', () => {
  const v = vault({ '00-index.md': '# Índex' });
  assert.match(buildContext(v), /estat-actual\.md no trobat/);
  rmSync(v, { recursive: true });
});

test('vault sense índex', () => {
  const v = vault({ 'README.md': 'x' });
  assert.match(buildContext(v), /sense índex/);
  rmSync(v, { recursive: true });
});

test('trunca', () => {
  const v = vault({ '00-index.md': 'a'.repeat(500) });
  const out = buildContext(v, { maxChars: 100 });
  assert.ok(out.length <= 130);
  assert.match(out, /truncat/);
  rmSync(v, { recursive: true });
});
