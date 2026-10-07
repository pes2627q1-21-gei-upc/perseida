// Copia .agents/skills (font de veritat) a .claude/skills (Claude Code).
// Ús: node .agents/scripts/sync-skills.mjs [--check]
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [relative(base, p).split('\\').join('/')];
  });
}

export function syncSkills({ src, dest, check }) {
  const srcFiles = listFiles(src);
  if (srcFiles.length === 0) throw new Error(`src no existeix o és buit: ${src}`);
  const destFiles = listFiles(dest);
  const changed = [];
  for (const f of srcFiles) {
    const s = readFileSync(join(src, f));
    const d = existsSync(join(dest, f)) ? readFileSync(join(dest, f)) : null;
    if (d === null || !s.equals(d)) {
      changed.push(f);
      if (!check) {
        mkdirSync(dirname(join(dest, f)), { recursive: true });
        writeFileSync(join(dest, f), s);
      }
    }
  }
  for (const f of destFiles) {
    if (!srcFiles.includes(f)) {
      changed.push(f);
      if (!check) rmSync(join(dest, f));
    }
  }
  if (!check) pruneEmptyDirs(dest);
  return { changed: changed.sort() };
}

function pruneEmptyDirs(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) pruneEmptyDirs(join(dir, e.name));
  }
  if (existsSync(dir) && statSync(dir).isDirectory() && readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const check = process.argv.includes('--check');
  let changed;
  try {
    ({ changed } = syncSkills({
      src: join(root, '.agents', 'skills'),
      dest: join(root, '.claude', 'skills'),
      check,
    }));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (check && changed.length > 0) {
    console.error('.claude/skills no està sincronitzat amb .agents/skills:');
    for (const f of changed) console.error('  - ' + f);
    console.error('Executa: node .agents/scripts/sync-skills.mjs');
    process.exit(1);
  }
  console.log(check ? 'Skills sincronitzades.' : `Sincronitzat (${changed.length} fitxers canviats).`);
}
