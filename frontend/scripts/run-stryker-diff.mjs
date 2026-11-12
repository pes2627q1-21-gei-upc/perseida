#!/usr/bin/env node
/**
 * Executa mutation testing amb Stryker únicament sobre els fitxers de lògica de frontend modificats a la PR.
 *
 * Requisit ADR-0028 i TG-359 (#371):
 * - Només s'aplica sobre els fitxers de lògica/domini/features canviats a `frontend/src/` respecte a la branca base.
 * - Exclou components visuals purs (`src/shared/ui/**`), arxius de test i fitxers `.d.ts`.
 * - Llindar bloquejant: mutation score >= 70% (gestionat via thresholds.break = 70 a stryker.config.json).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function getArgs() {
  const args = process.argv.slice(2);
  let baseBranch = 'origin/develop';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base-branch' && args[i + 1]) {
      baseBranch = args[i + 1];
      i++;
    }
  }
  return { baseBranch };
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

function main() {
  const { baseBranch } = getArgs();
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

  const mutateArg = changedFiles.join(',');
  console.log('🚀 Executant Stryker sobre els fitxers modificats...');

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

main();
