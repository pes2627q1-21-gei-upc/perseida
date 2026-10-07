import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const HELPER = join(import.meta.dirname, 'is-main.mjs');

function withTmp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ismain-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function setup(root) {
  copyFileSync(HELPER, join(root, 'is-main.mjs'));
  const probe = join(root, 'probe.mjs');
  writeFileSync(
    probe,
    "import { isMain } from './is-main.mjs';\nprocess.stdout.write(String(isMain(import.meta.url)));\n",
  );
  return probe;
}

function run(file) {
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('és true quan el mòdul s\'executa directament', () => {
  withTmp((root) => assert.equal(run(setup(root)), 'true'));
});

test('és false quan el mòdul s\'importa des d\'un altre', () => {
  withTmp((root) => {
    const probe = setup(root);
    const other = join(root, 'other.mjs');
    writeFileSync(other, `import ${JSON.stringify(pathToFileURL(probe).href)};\n`);
    assert.equal(run(other), 'false');
  });
});

test('és true quan s\'executa a través d\'un enllaç simbòlic', (t) => {
  withTmp((root) => {
    const probe = setup(root);
    const link = join(root, 'link.mjs');
    try {
      symlinkSync(probe, link);
    } catch {
      t.skip('la plataforma no permet crear enllaços simbòlics');
      return;
    }
    assert.equal(run(link), 'true');
  });
});

test('és false sense process.argv[1]', async () => {
  const { isMain } = await import(pathToFileURL(HELPER).href);
  const saved = process.argv[1];
  try {
    process.argv[1] = '';
    assert.equal(isMain(import.meta.url), false);
    process.argv.length = 1;
    assert.equal(isMain(import.meta.url), false);
  } finally {
    process.argv[1] = saved;
  }
});

test('és false si argv[1] no existeix', async () => {
  const { isMain } = await import(pathToFileURL(HELPER).href);
  const saved = process.argv[1];
  try {
    process.argv[1] = join(tmpdir(), 'no-existeix-' + process.pid + '.mjs');
    assert.equal(isMain(import.meta.url), false);
  } finally {
    process.argv[1] = saved;
  }
});
