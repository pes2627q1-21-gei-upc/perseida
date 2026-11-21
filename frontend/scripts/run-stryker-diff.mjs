#!/usr/bin/env node
/**
 * Executa mutation testing amb Stryker únicament sobre els fitxers de lògica de frontend modificats a la PR.
 *
 * Requisit ADR-0028 i TG-359 (#371):
 * - Només s'aplica sobre els fitxers de lògica/domini/features canviats a `frontend/src/` respecte a la branca base,
 *   i dins de cada fitxer només sobre les línies afegides o canviades (rangs `fitxer:inici-final` de Stryker):
 *   tocar dues línies d'un fitxer existent no fa mutar-ne tot el codi anterior.
 * - Exclou components visuals purs (`src/shared/ui/**`), arxius de test i fitxers `.d.ts`.
 * - Amb `--pr-number`, la base és la de la PR segons l'API REST (en una PR apilada, la seva branca pare i no el
 *   tronc que `github.base_ref` dona), i només les línies d'aquesta capa es muten; sense l'API, `--base-branch`.
 * - Llindar bloquejant: mutation score >= 70% (gestionat via thresholds.break = 70 a stryker.config.json).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Arguments de la línia d'ordres: `--base-branch <ref>` (per defecte `origin/develop`) i, opcionalment,
 * `--pr-number <n>`, que fa consultar a l'API de GitHub la base real de la PR (vegeu `resolveBaseBranch`).
 */
export function parseArgs(args) {
  let baseBranch = 'origin/develop';
  let prNumber = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base-branch' && args[i + 1]) {
      baseBranch = args[i + 1];
      i++;
    } else if (args[i] === '--pr-number' && args[i + 1] !== undefined) {
      prNumber = /^[1-9]\d*$/.test(args[i + 1]) ? Number(args[i + 1]) : null;
      i++;
    }
  }
  return { baseBranch, prNumber };
}

/**
 * Branca base real d'una PR segons l'API REST (`base.ref`), o `null` si no es pot saber.
 *
 * En una PR apilada (stacked PRs de GitHub) `github.base_ref` del workflow val el tronc de la pila (`develop`)
 * i no la branca pare, de manera que mutaria tota la pila a cada capa. L'API REST de la PR sí que diu la base
 * real. Qualsevol error (xarxa, límit, resposta estranya) dona `null` perquè el qui crida mantingui la base d'abans.
 */
export async function fetchPrBaseRef({
  repository,
  prNumber,
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = fetch,
  timeoutMs = 15_000,
}) {
  if (!repository || !prNumber) return null;
  try {
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${apiUrl}/repos/${repository}/pulls/${prNumber}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const ref = (await response.json())?.base?.ref;
    return typeof ref === 'string' && ref ? ref : null;
  } catch {
    return null;
  }
}

/**
 * Tria la base del diff: la base real de la PR (`origin/<prBaseRef>`) si l'API l'ha donada, és un nom de branca
 * acceptable i la branca existeix en local; si no, la base donada amb `--base-branch` (`fallback`).
 * `refExists` s'injecta perquè la funció sigui pura.
 */
export function resolveBaseBranch({ fallback, prBaseRef, refExists }) {
  if (
    typeof prBaseRef === 'string' &&
    prBaseRef &&
    !prBaseRef.startsWith('-') &&
    !/\s/.test(prBaseRef)
  ) {
    const candidate = `origin/${prBaseRef}`;
    if (refExists(candidate)) return { baseBranch: candidate, source: 'api' };
  }
  return { baseBranch: fallback, source: 'fallback' };
}

function refExistsLocally(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function getChangedFrontendFiles(baseBranch) {
  try {
    const output = execFileSync(
      'git',
      ['diff', '--name-only', `${baseBranch}...HEAD`, '--', 'src', 'frontend/src'],
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );

    const files = output
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => (f.startsWith('frontend/') ? f.replace(/^frontend\//, '') : f))
      .filter((f) => {
        // Només fitxers TypeScript dins de src/
        if (!f.startsWith('src/') || (!f.endsWith('.ts') && !f.endsWith('.tsx'))) {
          return false;
        }
        // Excloure tests, index barrel i tipus declaratius
        if (
          f.includes('.test.') ||
          f.includes('.spec.') ||
          f.endsWith('.d.ts') ||
          f.endsWith('/index.ts')
        ) {
          return false;
        }
        // Excloure components visuals purs de shared/ui segons testing.md
        if (f.startsWith('src/shared/ui/')) {
          return false;
        }
        // Comprovar que el fitxer existeix realment a disc
        return fs.existsSync(f);
      });

    return [...new Set(files)].sort();
  } catch (err) {
    console.error(`❌ Error calculant el diff contra ${baseBranch}:`, err.message);
    return null;
  }
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Línies afegides o canviades de cada fitxer, segons un `git diff -U0`: `{ 'src/x.tsx': [[inici, final]] }`.
 * Les rutes es donen relatives a `frontend/`; un hunk que només esborra línies no afegeix cap rang.
 */
export function changedRanges(diffText) {
  const ranges = {};
  let file = null;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).trim();
      file = target === '/dev/null' ? null : target.replace(/^b\//, '').replace(/^frontend\//, '');
      continue;
    }
    const hunk = HUNK.exec(line);
    if (!hunk || !file) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count === 0) continue;
    (ranges[file] ??= []).push([start, start + count - 1]);
  }
  return ranges;
}

/**
 * Ruta com a glob literal per a Stryker, que la llegeix amb minimatch després d'un `path.resolve` (a Windows
 * converteix `\` en `/`, i l'escapament amb barra invertida es perd): cada metacaràcter (`[id]`, `(app)`)
 * es posa en una classe d'un sol caràcter (`[[]`, `[]]`, `[(]`), que va igual a Windows i a Linux.
 */
export function globLiteral(file) {
  return file.replace(/[[\]{}()*?!+@]/g, (char) => `[${char}]`);
}

/** Objectius de `--mutate` de Stryker: un `fitxer:inici-final` per rang dels fitxers a mutar. */
export function mutateTargets(files, ranges) {
  return files.flatMap((file) =>
    (ranges[file] ?? []).map(([start, end]) => `${globLiteral(file)}:${start}-${end}`),
  );
}

function getChangedRanges(baseBranch) {
  const diff = execFileSync('git', ['diff', '-U0', `${baseBranch}...HEAD`, '--', 'src'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return changedRanges(diff);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let baseBranch = args.baseBranch;
  if (args.prNumber) {
    const prBaseRef = await fetchPrBaseRef({
      repository: process.env.GITHUB_REPOSITORY,
      prNumber: args.prNumber,
      token: process.env.GITHUB_TOKEN,
      apiUrl: process.env.GITHUB_API_URL || undefined,
    });
    const resolved = resolveBaseBranch({
      fallback: args.baseBranch,
      prBaseRef,
      refExists: refExistsLocally,
    });
    baseBranch = resolved.baseBranch;
    console.log(
      `ℹ️ Base del diff: ${baseBranch} (${
        resolved.source === 'api'
          ? `base real de la PR #${args.prNumber} segons l'API; ${args.baseBranch} és el que dona github.base_ref`
          : `no s'ha pogut obtenir la base real de la PR #${args.prNumber}; s'usa ${args.baseBranch}`
      }).`,
    );
  }
  const changedFiles = getChangedFrontendFiles(baseBranch);

  if (changedFiles === null) {
    console.error(`❌ ERROR: No s'ha pogut obtenir el git diff contra '${baseBranch}'.`);
    process.exit(1);
  }

  if (changedFiles.length === 0) {
    console.log(
      'ℹ️ Cap fitxer de lògica de frontend (src/) modificat a la PR. Mutation testing del frontend omès.',
    );
    process.exit(0);
  }

  console.log(`🧬 Fitxers de lògica de frontend a analitzar amb Stryker (${changedFiles.length}):`);
  for (const f of changedFiles) {
    console.log(`   - ${f}`);
  }

  const targets = mutateTargets(changedFiles, getChangedRanges(baseBranch));
  if (targets.length === 0) {
    console.log(
      'ℹ️ Els fitxers de lògica només perden línies. Mutation testing del frontend omès.',
    );
    process.exit(0);
  }
  const mutateArg = targets.join(',');
  console.log(`🚀 Executant Stryker sobre les línies modificades (${targets.length} rangs)...`);

  const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpmCmd, ['exec', 'stryker', 'run', '--mutate', mutateArg], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error('❌ ERROR executant Stryker:', result.error.message);
    process.exit(1);
  }

  if (result.signal) {
    console.error(
      `❌ ERROR: Stryker ha finalitzat de forma anòmala per senyal (${result.signal}).`,
    );
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
