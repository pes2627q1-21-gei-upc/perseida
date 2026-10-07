import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildContext } from './vault-context.mjs';

const SCRIPTS = import.meta.dirname;
const HEADER =
  'Context del vault de Perseida (autogenerat). Abans de treballar, segueix AGENTS.md i la skill vault-context.';

// Executa fn amb un directori temporal que sempre s'esborra.
function withTmp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'vault-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function write(root, files) {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}

// Arbre hermètic: <root>/.agents/scripts amb els scripts i <root>/obsidian_vault.
function repo(root, vaultFiles) {
  const scripts = join(root, '.agents', 'scripts');
  mkdirSync(scripts, { recursive: true });
  for (const f of ['vault-context.mjs', 'is-main.mjs']) copyFileSync(join(SCRIPTS, f), join(scripts, f));
  if (vaultFiles) write(join(root, 'obsidian_vault'), vaultFiles);
  return join(scripts, 'vault-context.mjs');
}

function cli(script) {
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('inclou índex i estat sense frontmatter', () =>
  withTmp((root) => {
    write(root, {
      '00-index.md': '---\ntitol: x\n---\n# Índex\nhola',
      'estat/estat-actual.md': '---\ntitol: y\n---\n# Estat\nsprint 1',
    });
    const out = buildContext(root);
    assert.match(out, /# Índex/);
    assert.match(out, /sprint 1/);
    assert.doesNotMatch(out, /titol:/);
  }));

test("indica quan falta l'estat", () =>
  withTmp((root) => {
    write(root, { '00-index.md': '# Índex' });
    assert.match(buildContext(root), /estat-actual\.md no trobat/);
  }));

test('vault sense índex', () =>
  withTmp((root) => {
    write(root, { 'README.md': 'x' });
    assert.match(buildContext(root), /sense índex/);
  }));

test('trunca a maxChars exactes i afegeix el marcador', () =>
  withTmp((root) => {
    write(root, { '00-index.md': 'a'.repeat(500) });
    const full = buildContext(root, { maxChars: 1e9 });
    const out = buildContext(root, { maxChars: 100 });
    assert.equal(out, full.slice(0, 100) + '\n… (truncat)');
  }));

test('no trunca quan la mida és exactament el límit', () =>
  withTmp((root) => {
    write(root, { '00-index.md': 'a'.repeat(500) });
    const full = buildContext(root, { maxChars: 1e9 });
    assert.equal(buildContext(root, { maxChars: full.length }), full);
    assert.match(buildContext(root, { maxChars: full.length - 1 }), /\(truncat\)$/);
  }));

test('treu el frontmatter amb CRLF', () =>
  withTmp((root) => {
    write(root, { '00-index.md': '---\r\ntitol: x\r\n---\r\n# x' });
    const out = buildContext(root);
    assert.doesNotMatch(out, /titol/);
    assert.match(out, /# x/);
  }));

test('treu el frontmatter sense salt de línia després del tancament', () =>
  withTmp((root) => {
    write(root, { '00-index.md': '---\ntitol: x\n---' });
    const out = buildContext(root);
    assert.doesNotMatch(out, /titol|---/);
  }));

test('treu el frontmatter buit', () =>
  withTmp((root) => {
    write(root, { '00-index.md': '---\n---\n# x' });
    assert.equal(buildContext(root).split('\n\n')[1], '# x');
  }));

test('no confon un separador del cos amb frontmatter', () =>
  withTmp((root) => {
    write(root, { '00-index.md': '# x\n---\nsegueix\n---\nfi' });
    assert.match(buildContext(root), /# x\n---\nsegueix\n---\nfi/);
  }));

test("CLI: JSON SessionStart amb l'índex i exit 0", () =>
  withTmp((root) => {
    const script = repo(root, {
      '00-index.md': '---\ntitol: x\n---\n# Índex únic\nhola',
      'estat/estat-actual.md': '# Estat\nsprint 7',
    });
    const json = cli(script);
    assert.equal(json.hookSpecificOutput.hookEventName, 'SessionStart');
    const ctx = json.hookSpecificOutput.additionalContext;
    assert.ok(ctx.startsWith(HEADER));
    assert.match(ctx, /# Índex únic/);
    assert.match(ctx, /sprint 7/);
  }));

test('CLI: vault inexistent -> exit 0 i «sense índex»', () =>
  withTmp((root) => {
    const json = cli(repo(root));
    assert.match(json.hookSpecificOutput.additionalContext, /sense índex/);
  }));

test("CLI: índex il·legible -> exit 0 i missatge d'error", () =>
  withTmp((root) => {
    const script = repo(root);
    mkdirSync(join(root, 'obsidian_vault', '00-index.md'), { recursive: true });
    const json = cli(script);
    assert.match(json.hookSpecificOutput.additionalContext, /No s'ha pogut llegir/);
  }));
