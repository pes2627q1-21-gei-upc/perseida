import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseAgent, syncAgents, ADAPTERS, MARKER } from './sync-agents.mjs';

const SCRIPTS = import.meta.dirname;

function withTmp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'agents-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const AGENT = (name, access = 'write', body = 'Fes la feina.') =>
  `---\nname: ${name}\ndescription: Descripció de ${name}: quan delegar-hi\naccess: ${access}\n---\n\n${body}\n`;

function repo(root, agents = { backend: AGENT('backend'), reviewer: AGENT('reviewer', 'read-only') }) {
  const dir = join(root, '.agents', 'agents');
  mkdirSync(dir, { recursive: true });
  for (const [n, c] of Object.entries(agents)) writeFileSync(join(dir, `${n}.md`), c);
}

test('parseAgent llegeix camps i cos (CRLF inclòs)', () => {
  const a = parseAgent(AGENT('backend').replace(/\n/g, '\r\n'), 'backend.md');
  assert.deepEqual(a, {
    name: 'backend',
    description: 'Descripció de backend: quan delegar-hi',
    access: 'write',
    body: 'Fes la feina.',
  });
});

test('parseAgent rebutja entrades invàlides', () => {
  assert.throws(() => parseAgent('sense frontmatter', 'x.md'), /frontmatter/);
  assert.throws(() => parseAgent('---\nname: x\naccess: write\n---\ncos', 'x.md'), /description/);
  assert.throws(() => parseAgent(AGENT('altre'), 'x.md'), /coincidir/);
  assert.throws(() => parseAgent(AGENT('x', 'root'), 'x.md'), /access/);
  assert.throws(() => parseAgent(AGENT('Bad_Name'), 'Bad_Name.md'), /kebab/);
});

test('genera un fitxer per eina i agent, amb marca', () =>
  withTmp((root) => {
    repo(root);
    const { changed } = syncAgents({ root });
    assert.equal(changed.length, ADAPTERS.length * 2);
    for (const p of [
      '.claude/agents/backend.md',
      '.codex/agents/backend.toml',
      '.opencode/agents/backend.md',
      '.github/agents/backend.agent.md',
      '.gemini/agents/backend.md',
    ]) {
      assert.ok(readFileSync(join(root, p), 'utf8').includes(MARKER), p);
    }
  }));

test('read-only restringeix escriptura a cada eina; write no restringeix', () =>
  withTmp((root) => {
    repo(root);
    syncAgents({ root });
    const r = (p) => readFileSync(join(root, p), 'utf8');
    assert.match(r('.claude/agents/reviewer.md'), /disallowedTools: Edit, Write/);
    assert.match(r('.codex/agents/reviewer.toml'), /sandbox_mode = "read-only"/);
    assert.match(r('.opencode/agents/reviewer.md'), /edit: deny/);
    assert.match(r('.github/agents/reviewer.agent.md'), /tools: \['read'/);
    assert.match(r('.gemini/agents/reviewer.md'), /- grep_search/);
    assert.doesNotMatch(r('.claude/agents/backend.md'), /disallowedTools/);
    assert.match(r('.codex/agents/backend.toml'), /workspace-write/);
    assert.doesNotMatch(r('.gemini/agents/backend.md'), /tools:/);
  }));

test('TOML escapa barres i cometes triples del cos', () =>
  withTmp((root) => {
    repo(root, { backend: AGENT('backend', 'write', 'ruta C:\\x i """ final') });
    syncAgents({ root });
    const toml = readFileSync(join(root, '.codex/agents/backend.toml'), 'utf8');
    assert.ok(toml.includes('C:\\\\x i \\"\\"\\" final'));
  }));

test('--check no escriu i detecta divergències', () =>
  withTmp((root) => {
    repo(root);
    assert.equal(syncAgents({ root, check: true }).changed.length, ADAPTERS.length * 2);
    assert.ok(!existsSync(join(root, '.claude')));
    syncAgents({ root });
    assert.deepEqual(syncAgents({ root, check: true }).changed, []);
    writeFileSync(join(root, '.claude/agents/backend.md'), 'editat a mà');
    assert.deepEqual(syncAgents({ root, check: true }).changed, ['.claude/agents/backend.md']);
  }));

test('--check tolera finals de línia CRLF dels fitxers generats', () =>
  withTmp((root) => {
    repo(root);
    syncAgents({ root });
    const p = join(root, '.gemini/agents/backend.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/\n/g, '\r\n'));
    assert.deepEqual(syncAgents({ root, check: true }).changed, []);
  }));

test('esborra generats orfes però respecta fitxers escrits a mà', () =>
  withTmp((root) => {
    repo(root);
    syncAgents({ root });
    rmSync(join(root, '.agents/agents/reviewer.md'));
    writeFileSync(join(root, '.github/agents/propi.agent.md'), 'fet a mà');
    syncAgents({ root });
    assert.ok(!existsSync(join(root, '.claude/agents/reviewer.md')));
    assert.ok(existsSync(join(root, '.github/agents/propi.agent.md')));
  }));

test('falla si no hi ha agents', () =>
  withTmp((root) => {
    mkdirSync(join(root, '.agents', 'agents'), { recursive: true });
    assert.throws(() => syncAgents({ root }), /buit/);
    assert.throws(() => syncAgents({ root: join(root, 'x') }), /no existeix/);
  }));

test('CLI: exit 1 amb --check si hi ha divergències, 0 quan està sincronitzat', () =>
  withTmp((root) => {
    const scripts = join(root, '.agents', 'scripts');
    mkdirSync(scripts, { recursive: true });
    for (const f of ['sync-agents.mjs', 'is-main.mjs']) copyFileSync(join(SCRIPTS, f), join(scripts, f));
    repo(root);
    const run = (...a) => spawnSync(process.execPath, [join(scripts, 'sync-agents.mjs'), ...a], { encoding: 'utf8' });
    assert.equal(run('--check').status, 1);
    assert.equal(run().status, 0);
    assert.equal(run('--check').status, 0);
  }));
