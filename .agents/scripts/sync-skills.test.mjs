import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { syncSkills } from './sync-skills.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sync-'));
  const src = join(root, 'src');
  const dest = join(root, 'dest');
  mkdirSync(join(src, 'a', 'references'), { recursive: true });
  writeFileSync(join(src, 'a', 'SKILL.md'), 'hola');
  writeFileSync(join(src, 'a', 'references', 'X.md'), 'x');
  return { root, src, dest };
}

test('copia tot a un destí inexistent', () => {
  const { root, src, dest } = fixture();
  const r = syncSkills({ src, dest, check: false });
  assert.equal(readFileSync(join(dest, 'a', 'references', 'X.md'), 'utf8'), 'x');
  assert.equal(r.changed.length, 2);
  rmSync(root, { recursive: true });
});

test('segona execució no canvia res', () => {
  const { root, src, dest } = fixture();
  syncSkills({ src, dest, check: false });
  assert.deepEqual(syncSkills({ src, dest, check: false }).changed, []);
  rmSync(root, { recursive: true });
});

test('check detecta fitxer modificat i no escriu', () => {
  const { root, src, dest } = fixture();
  syncSkills({ src, dest, check: false });
  writeFileSync(join(src, 'a', 'SKILL.md'), 'canviat');
  const r = syncSkills({ src, dest, check: true });
  assert.deepEqual(r.changed, ['a/SKILL.md']);
  assert.equal(readFileSync(join(dest, 'a', 'SKILL.md'), 'utf8'), 'hola');
  rmSync(root, { recursive: true });
});

test('esborra sobrants del destí', () => {
  const { root, src, dest } = fixture();
  syncSkills({ src, dest, check: false });
  writeFileSync(join(dest, 'sobrant.md'), 'z');
  assert.deepEqual(syncSkills({ src, dest, check: true }).changed, ['sobrant.md']);
  syncSkills({ src, dest, check: false });
  assert.equal(existsSync(join(dest, 'sobrant.md')), false);
  rmSync(root, { recursive: true });
});
