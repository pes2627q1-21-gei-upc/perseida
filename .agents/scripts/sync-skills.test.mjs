import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { syncSkills } from './sync-skills.mjs';

const SCRIPTS = import.meta.dirname;

// Executa fn amb un directori temporal que sempre s'esborra.
function withTmp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'sync-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function fixture(root) {
  const src = join(root, 'src');
  const dest = join(root, 'dest');
  mkdirSync(join(src, 'a', 'references'), { recursive: true });
  writeFileSync(join(src, 'a', 'SKILL.md'), 'hola');
  writeFileSync(join(src, 'a', 'references', 'X.md'), 'x');
  return { src, dest };
}

// Arbre hermètic: <root>/.agents/{scripts,skills} amb còpia dels scripts.
function repo(root, { skills = true } = {}) {
  const scripts = join(root, '.agents', 'scripts');
  mkdirSync(scripts, { recursive: true });
  for (const f of ['sync-skills.mjs', 'is-main.mjs']) copyFileSync(join(SCRIPTS, f), join(scripts, f));
  if (skills) {
    mkdirSync(join(root, '.agents', 'skills', 's'), { recursive: true });
    writeFileSync(join(root, '.agents', 'skills', 's', 'SKILL.md'), 'contingut');
  }
  return join(scripts, 'sync-skills.mjs');
}

function cli(script, ...args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('copia tot a un destí inexistent', () =>
  withTmp((root) => {
    const { src, dest } = fixture(root);
    const r = syncSkills({ src, dest, check: false });
    assert.equal(readFileSync(join(dest, 'a', 'references', 'X.md'), 'utf8'), 'x');
    assert.equal(r.changed.length, 2);
  }));

test('segona execució no canvia res', () =>
  withTmp((root) => {
    const { src, dest } = fixture(root);
    syncSkills({ src, dest, check: false });
    assert.deepEqual(syncSkills({ src, dest, check: false }).changed, []);
  }));

test('check detecta fitxer modificat i no escriu', () =>
  withTmp((root) => {
    const { src, dest } = fixture(root);
    syncSkills({ src, dest, check: false });
    writeFileSync(join(src, 'a', 'SKILL.md'), 'canviat');
    const r = syncSkills({ src, dest, check: true });
    assert.deepEqual(r.changed, ['a/SKILL.md']);
    assert.equal(readFileSync(join(dest, 'a', 'SKILL.md'), 'utf8'), 'hola');
  }));

test('esborra sobrants del destí', () =>
  withTmp((root) => {
    const { src, dest } = fixture(root);
    syncSkills({ src, dest, check: false });
    writeFileSync(join(dest, 'sobrant.md'), 'z');
    assert.deepEqual(syncSkills({ src, dest, check: true }).changed, ['sobrant.md']);
    syncSkills({ src, dest, check: false });
    assert.equal(existsSync(join(dest, 'sobrant.md')), false);
  }));

test('check informa dels sobrants i els deixa al disc', () =>
  withTmp((root) => {
    const { src, dest } = fixture(root);
    syncSkills({ src, dest, check: false });
    mkdirSync(join(dest, 'extra'), { recursive: true });
    writeFileSync(join(dest, 'extra', 'Y.md'), 'y');
    const r = syncSkills({ src, dest, check: true });
    assert.deepEqual(r.changed, ['extra/Y.md']);
    assert.equal(readFileSync(join(dest, 'extra', 'Y.md'), 'utf8'), 'y');
  }));

test('la còpia conserva els bytes exactes (CRLF)', () =>
  withTmp((root) => {
    const { src, dest } = fixture(root);
    const crlf = Buffer.from('línia 1\r\nlínia 2\r\n', 'utf8');
    writeFileSync(join(src, 'a', 'SKILL.md'), crlf);
    syncSkills({ src, dest, check: false });
    assert.ok(readFileSync(join(dest, 'a', 'SKILL.md')).equals(crlf));
    assert.deepEqual(syncSkills({ src, dest, check: true }).changed, []);
  }));

test('check detecta un fitxer que només difereix en CRLF vs LF', () =>
  withTmp((root) => {
    const { src, dest } = fixture(root);
    writeFileSync(join(src, 'a', 'SKILL.md'), 'a\nb\n');
    syncSkills({ src, dest, check: false });
    writeFileSync(join(dest, 'a', 'SKILL.md'), 'a\r\nb\r\n');
    assert.deepEqual(syncSkills({ src, dest, check: true }).changed, ['a/SKILL.md']);
    assert.equal(readFileSync(join(dest, 'a', 'SKILL.md'), 'utf8'), 'a\r\nb\r\n');
  }));

test('src inexistent llença error i no toca el destí', () =>
  withTmp((root) => {
    const { src, dest } = fixture(root);
    syncSkills({ src, dest, check: false });
    rmSync(src, { recursive: true });
    assert.throws(() => syncSkills({ src, dest, check: false }), /src no existeix o és buit/);
    assert.throws(() => syncSkills({ src, dest, check: true }), /src no existeix o és buit/);
    assert.equal(readFileSync(join(dest, 'a', 'SKILL.md'), 'utf8'), 'hola');
  }));

test('src buit llença error i no toca el destí', () =>
  withTmp((root) => {
    const { src, dest } = fixture(root);
    syncSkills({ src, dest, check: false });
    rmSync(src, { recursive: true });
    mkdirSync(join(src, 'buida'), { recursive: true });
    assert.throws(() => syncSkills({ src, dest, check: false }), /src no existeix o és buit/);
    assert.throws(() => syncSkills({ src, dest, check: true }), /src no existeix o és buit/);
    assert.equal(readFileSync(join(dest, 'a', 'references', 'X.md'), 'utf8'), 'x');
  }));

test('CLI --check amb tot sincronitzat: exit 0 i missatge', () =>
  withTmp((root) => {
    const script = repo(root);
    assert.equal(cli(script).status, 0);
    const r = cli(script, '--check');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Skills sincronitzades\./);
  }));

test('CLI --check amb divergència: exit 1 amb fitxer i comanda a stderr', () =>
  withTmp((root) => {
    const script = repo(root);
    cli(script);
    writeFileSync(join(root, '.agents', 'skills', 's', 'SKILL.md'), 'nou');
    const r = cli(script, '--check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /s\/SKILL\.md/);
    assert.match(r.stderr, /node \.agents\/scripts\/sync-skills\.mjs/);
    assert.equal(readFileSync(join(root, '.claude', 'skills', 's', 'SKILL.md'), 'utf8'), 'contingut');
  }));

test('CLI sense --check sincronitza i crea el destí', () =>
  withTmp((root) => {
    const script = repo(root);
    const r = cli(script);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Sincronitzat \(1 fitxers canviats\)/);
    assert.equal(readFileSync(join(root, '.claude', 'skills', 's', 'SKILL.md'), 'utf8'), 'contingut');
  }));

test('CLI amb src inexistent o buit: exit 1', () =>
  withTmp((root) => {
    const script = repo(root, { skills: false });
    for (const args of [[], ['--check']]) {
      const r = cli(script, ...args);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /src no existeix o és buit/);
    }
    mkdirSync(join(root, '.agents', 'skills', 'buida'), { recursive: true });
    const r = cli(script);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /src no existeix o és buit/);
  }));
