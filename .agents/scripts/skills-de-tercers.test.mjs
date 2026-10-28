import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { COLLECTIONS, detect, buildReport, buildHookContext, searchDirs } from './skills-de-tercers.mjs';

const SCRIPTS = import.meta.dirname;

function withTmp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'skills3-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Instal·la una skill falsa: <base>/<eina>/skills/<nom>/SKILL.md
function skill(base, tool, name) {
  const dir = join(base, tool, 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\n---\n`);
}

const status = (results) => Object.fromEntries(results.map((r) => [r.id, r.status]));

test('sense res instal·lat: totes absents', () =>
  withTmp((tmp) => {
    const r = detect({ home: join(tmp, 'home'), root: join(tmp, 'repo') });
    assert.deepEqual(status(r), { emil: 'absent', impeccable: 'absent', taste: 'absent' });
  }));

test('detecta una col·lecció completa a nivell d\'usuari', () =>
  withTmp((tmp) => {
    const home = join(tmp, 'home');
    skill(home, '.claude', 'impeccable');
    const r = detect({ home, root: join(tmp, 'repo') });
    assert.equal(status(r).impeccable, 'installed');
    assert.equal(status(r).taste, 'absent');
  }));

test('una col·lecció amb només part de les skills clau és parcial i diu què falta', () =>
  withTmp((tmp) => {
    const home = join(tmp, 'home');
    skill(home, '.claude', 'emil-design-eng');
    const emil = detect({ home, root: join(tmp, 'repo') }).find((c) => c.id === 'emil');
    assert.equal(emil.status, 'partial');
    assert.deepEqual(emil.missing, ['animate-expo']);
  }));

test('detecta skills a altres eines (.agents) i al projecte', () =>
  withTmp((tmp) => {
    const home = join(tmp, 'home');
    const repoDir = join(tmp, 'repo');
    skill(home, '.agents', 'design-taste-frontend');
    skill(repoDir, '.claude', 'emil-design-eng');
    skill(repoDir, '.cursor', 'animate-expo');
    const r = detect({ home, root: repoDir });
    assert.equal(status(r).taste, 'installed');
    assert.equal(status(r).emil, 'installed');
  }));

test('una carpeta sense SKILL.md no compta com a skill instal·lada', () =>
  withTmp((tmp) => {
    const home = join(tmp, 'home');
    mkdirSync(join(home, '.claude', 'skills', 'impeccable'), { recursive: true });
    assert.equal(status(detect({ home, root: join(tmp, 'repo') })).impeccable, 'absent');
  }));

test('searchDirs ignora arrels no definides', () => {
  assert.deepEqual(searchDirs({ home: undefined, root: undefined }), []);
  assert.ok(searchDirs({ home: 'h', root: 'r' }).length > 2);
});

test('l\'informe llista les ordres només de les pendents', () => {
  const results = COLLECTIONS.map((c) => ({ ...c, status: c.id === 'taste' ? 'absent' : 'installed', found: [], missing: [] }));
  const text = buildReport(results);
  assert.match(text, /✔ Emil Kowalski/);
  assert.match(text, /✘ Taste/);
  assert.match(text, /npx skills@1.7.4 add https:\/\/github.com\/Leonxlnx\/taste-skill/);
  assert.doesNotMatch(text, /emilkowalski\/skills/);
});

test('el context del hook és curt si tot és instal·lat i no suggereix res', () => {
  const results = COLLECTIONS.map((c) => ({ ...c, status: 'installed', found: c.skills, missing: [] }));
  const text = buildHookContext(results);
  assert.match(text, /Disponibles: Emil Kowalski/);
  assert.doesNotMatch(text, /No instal·lades/);
});

test('el context del hook suggereix instal·lar quan falten, sense bloquejar', () => {
  const results = COLLECTIONS.map((c) => ({ ...c, status: 'absent', found: [], missing: c.skills }));
  const text = buildHookContext(results);
  assert.match(text, /No instal·lades: Emil Kowalski, Impeccable, Taste/);
  assert.match(text, /No bloquegen res/);
  assert.match(text, /SUGGERIMENT PER A L'HUMÀ/);
  assert.doesNotMatch(text, /Disponibles/);
});

// Arbre hermètic perquè el CLI trobi is-main.mjs i el seu propi directori.
function cli(tmp, args, env = {}) {
  const scripts = join(tmp, 'repo', '.agents', 'scripts');
  mkdirSync(scripts, { recursive: true });
  for (const f of ['skills-de-tercers.mjs', 'is-main.mjs']) copyFileSync(join(SCRIPTS, f), join(scripts, f));
  return spawnSync(process.execPath, [join(scripts, 'skills-de-tercers.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: join(tmp, 'home'), USERPROFILE: join(tmp, 'home'), ...env },
  });
}

test('CLI --hook emet JSON de SessionStart i surt amb codi 0', () =>
  withTmp((tmp) => {
    const r = cli(tmp, ['--hook']);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(out.hookSpecificOutput.additionalContext, /No instal·lades/);
  }));

test('CLI --hook no escriu res amb PERSEIDA_SKILLS_HINT=off', () =>
  withTmp((tmp) => {
    const r = cli(tmp, ['--hook'], { PERSEIDA_SKILLS_HINT: 'off' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }));

test('CLI --json llista les tres col·leccions', () =>
  withTmp((tmp) => {
    const r = cli(tmp, ['--json']);
    assert.equal(r.status, 0);
    assert.deepEqual(JSON.parse(r.stdout).map((c) => c.id), ['emil', 'impeccable', 'taste']);
  }));

test('CLI sense opcions imprimeix l\'informe en text', () =>
  withTmp((tmp) => {
    const r = cli(tmp, []);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /✘ Impeccable/);
  }));
