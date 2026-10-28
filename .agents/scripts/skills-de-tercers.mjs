// Detecta si la persona té instal·lades les skills de disseny de tercers (opcionals) i diu què fer-ne.
// Ús: node .agents/scripts/skills-de-tercers.mjs [--json | --hook]
//   (sense opcions) informe en text · --json informe per a màquines · --hook sortida de SessionStart.
// Silenciar els suggeriments: PERSEIDA_SKILLS_HINT=off. Mai falla ni bloqueja: surt sempre amb codi 0.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

// Skills clau de cada col·lecció: si totes hi són, la col·lecció compta com a instal·lada.
export const COLLECTIONS = [
  {
    id: 'emil',
    label: 'Emil Kowalski',
    skills: ['emil-design-eng', 'animate-expo'],
    use: 'criteri de moviment i construcció d\'animacions a React Native (animate-expo)',
    install: 'npx skills@latest add emilkowalski/skills -g -a claude-code -s "*" -y --copy',
  },
  {
    id: 'impeccable',
    label: 'Impeccable',
    skills: ['impeccable'],
    use: 'auditoria, crítica UX i passada final (audit, critique, polish)',
    install: 'npx impeccable@latest install --yes --providers=claude --user --no-hooks',
  },
  {
    id: 'taste',
    label: 'Taste',
    skills: ['design-taste-frontend'],
    use: 'inspector de navegador per a l\'admin web i les pàgines públiques',
    install:
      'npx skills@latest add https://github.com/Leonxlnx/taste-skill -g -a claude-code -s design-taste-frontend -y --copy',
  },
];

// Carpetes d'eines on es poden instal·lar skills (a l'usuari i al projecte).
const TOOL_DIRS = ['.claude', '.agents', '.codex', '.cursor', '.gemini', '.opencode', '.grok', '.hermes'];

export function searchDirs({ home, root }) {
  const dirs = [];
  for (const base of [home, root]) {
    if (!base) continue;
    for (const tool of TOOL_DIRS) dirs.push(join(base, tool, 'skills'));
  }
  return dirs;
}

function findSkill(name, dirs) {
  return dirs.find((d) => existsSync(join(d, name, 'SKILL.md'))) ?? null;
}

// Retorna l'estat de cada col·lecció: instal·lada, parcial o absent.
export function detect({ home = homedir(), root } = {}) {
  const dirs = searchDirs({ home, root });
  return COLLECTIONS.map((c) => {
    const found = c.skills.filter((s) => findSkill(s, dirs));
    const missing = c.skills.filter((s) => !found.includes(s));
    const status = missing.length === 0 ? 'installed' : found.length === 0 ? 'absent' : 'partial';
    return { ...c, status, found, missing };
  });
}

const MARK = { installed: '✔', partial: '◐', absent: '✘' };

export function buildReport(results) {
  const lines = results.map(
    (r) => `${MARK[r.status]} ${r.label}: ${r.status === 'installed' ? 'instal·lada' : r.status === 'partial' ? `incompleta (falta ${r.missing.join(', ')})` : 'no instal·lada'}`,
  );
  const pending = results.filter((r) => r.status !== 'installed');
  if (pending.length > 0) {
    lines.push('', 'Per instal·lar (a nivell d\'usuari, opcional):');
    for (const r of pending) lines.push(`  ${r.label}: ${r.install}`);
  }
  return lines.join('\n');
}

const REF = '.agents/skills/estetica-frutiger-cosmo/references/skills-de-tercers.md';

// Text que rep l'agent en començar la sessió.
export function buildHookContext(results) {
  const ok = results.filter((r) => r.status === 'installed');
  const pending = results.filter((r) => r.status !== 'installed');
  const parts = [
    'Skills de disseny de tercers (opcionals, subordinades al brief de estetica-frutiger-cosmo).',
  ];
  if (ok.length > 0) {
    parts.push(
      `Disponibles: ${ok.map((r) => `${r.label} (${r.use})`).join('; ')}. En feina visual, usa-les segons ${REF}; el brief de Perseida guanya sempre.`,
    );
  }
  if (pending.length > 0) {
    parts.push(
      `No instal·lades: ${pending.map((r) => r.label).join(', ')}. No bloquegen res: continua amb les skills del repo. ` +
        `Suggereix a la persona, una sola vegada i només si fa feina visual de frontend, instal·lar-les per millorar el resultat, ` +
        `i dona-li l'ordre de \`node .agents/scripts/skills-de-tercers.mjs\` (o la guia obsidian_vault/guies/skills-de-disseny-de-tercers.md). ` +
        `Si ets un subagent, posa el suggeriment a la sortida com a «SUGGERIMENT PER A L'HUMÀ».`,
    );
  }
  return parts.join('\n');
}

if (isMain(import.meta.url)) {
  const arg = process.argv[2];
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const results = detect({ root });
    if (arg === '--json') {
      process.stdout.write(JSON.stringify(results.map(({ id, status, found, missing, install }) => ({ id, status, found, missing, install })), null, 2) + '\n');
    } else if (arg === '--hook') {
      if (process.env.PERSEIDA_SKILLS_HINT !== 'off') {
        process.stdout.write(
          JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: buildHookContext(results) } }),
        );
      }
    } else {
      process.stdout.write(buildReport(results) + '\n');
    }
  } catch (e) {
    // Un hook d'ajuda no pot trencar l'arrencada de la sessió.
    if (arg !== '--hook') process.stderr.write(`No s'ha pogut detectar: ${e.message}\n`);
  }
}
