// Genera els subagents natius de cada eina d'IA a partir de .agents/agents/*.md (font de veritat).
// Ús: node .agents/scripts/sync-agents.mjs [--check]
//
// Format canònic: frontmatter amb `name`, `description` i `access` (write | read-only) + cos (prompt).
// Antigravity llegeix .agents/agents/ directament; Cursor llegeix .claude/agents/. La resta tenen adaptador.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

export const MARKER = 'GENERAT per .agents/scripts/sync-agents.mjs';
const ACCESS = ['write', 'read-only'];
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

const normalize = (s) => s.replace(/\r\n/g, '\n');
const quote = (s) => JSON.stringify(s);

export function parseAgent(text, file) {
  const m = FRONTMATTER.exec(normalize(text));
  if (!m) throw new Error(`${file}: falta el frontmatter (--- ... ---)`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i < 0) throw new Error(`${file}: línia de frontmatter invàlida: "${line}"`);
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  const stem = file.replace(/\.md$/, '');
  for (const key of ['name', 'description', 'access']) {
    if (!meta[key]) throw new Error(`${file}: falta el camp "${key}"`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.name)) throw new Error(`${file}: "name" ha de ser kebab-case`);
  if (meta.name !== stem) throw new Error(`${file}: "name" (${meta.name}) ha de coincidir amb el fitxer (${stem})`);
  if (!ACCESS.includes(meta.access)) throw new Error(`${file}: "access" ha de ser ${ACCESS.join(' o ')}`);
  return { name: meta.name, description: meta.description, access: meta.access, body: m[2].trim() };
}

const yaml = (lines, body) => `---\n${lines.join('\n')}\n---\n\n<!-- ${MARKER}. No l'editis. -->\n\n${body}\n`;
const readOnly = (a) => a.access === 'read-only';

function tomlMultiline(s) {
  return `"""\n${s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}\n"""`;
}

// Un adaptador per eina (Strategy): on s'escriu i com es renderitza.
export const ADAPTERS = [
  {
    id: 'claude',
    dir: '.claude/agents',
    file: (a) => `${a.name}.md`,
    render: (a) =>
      yaml(
        [`name: ${a.name}`, `description: ${quote(a.description)}`, ...(readOnly(a) ? ['disallowedTools: Edit, Write'] : [])],
        a.body,
      ),
  },
  {
    id: 'codex',
    dir: '.codex/agents',
    file: (a) => `${a.name}.toml`,
    render: (a) =>
      [
        `# ${MARKER}. No l'editis.`,
        `name = ${quote(a.name)}`,
        `description = ${quote(a.description)}`,
        `sandbox_mode = ${quote(readOnly(a) ? 'read-only' : 'workspace-write')}`,
        `developer_instructions = ${tomlMultiline(a.body)}`,
        '',
      ].join('\n'),
  },
  {
    id: 'opencode',
    dir: '.opencode/agents',
    file: (a) => `${a.name}.md`,
    render: (a) =>
      yaml(
        [`description: ${quote(a.description)}`, 'mode: subagent', ...(readOnly(a) ? ['permission:', '  edit: deny'] : [])],
        a.body,
      ),
  },
  {
    id: 'copilot',
    dir: '.github/agents',
    file: (a) => `${a.name}.agent.md`,
    render: (a) =>
      yaml(
        [
          `name: ${a.name}`,
          `description: ${quote(a.description)}`,
          ...(readOnly(a) ? ["tools: ['read', 'search', 'execute']"] : []),
        ],
        a.body,
      ),
  },
  {
    id: 'gemini',
    dir: '.gemini/agents',
    file: (a) => `${a.name}.md`,
    render: (a) =>
      yaml(
        [
          `name: ${a.name}`,
          `description: ${quote(a.description)}`,
          'kind: local',
          ...(readOnly(a)
            ? ['tools:', '  - read_file', '  - list_directory', '  - glob', '  - grep_search', '  - run_shell_command']
            : []),
        ],
        a.body,
      ),
  },
];

export function loadAgents(src) {
  if (!existsSync(src)) throw new Error(`src no existeix: ${src}`);
  const files = readdirSync(src).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md').sort();
  if (files.length === 0) throw new Error(`src és buit: ${src}`);
  return files.map((f) => parseAgent(readFileSync(join(src, f), 'utf8'), f));
}

export function syncAgents({ root, src = join(root, '.agents', 'agents'), check = false, adapters = ADAPTERS }) {
  const agents = loadAgents(src);
  const changed = [];
  for (const ad of adapters) {
    const dir = join(root, ad.dir);
    const expected = new Map(agents.map((a) => [ad.file(a), ad.render(a)]));
    for (const [file, content] of expected) {
      const path = join(dir, file);
      const current = existsSync(path) ? normalize(readFileSync(path, 'utf8')) : null;
      if (current !== content) {
        changed.push(`${ad.dir}/${file}`);
        if (!check) {
          mkdirSync(dir, { recursive: true });
          writeFileSync(path, content);
        }
      }
    }
    // Esborra només fitxers generats abans (amb marca) que ja no tenen font; mai fitxers escrits a mà.
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (expected.has(file)) continue;
        const path = join(dir, file);
        if (readFileSync(path, 'utf8').includes(MARKER)) {
          changed.push(`${ad.dir}/${file}`);
          if (!check) rmSync(path);
        }
      }
    }
  }
  return { changed: changed.sort() };
}

if (isMain(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const check = process.argv.includes('--check');
  let changed;
  try {
    ({ changed } = syncAgents({ root, check }));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (check && changed.length > 0) {
    console.error('Subagents generats no sincronitzats amb .agents/agents:');
    for (const f of changed) console.error('  - ' + f);
    console.error('Executa: node .agents/scripts/sync-agents.mjs');
    process.exit(1);
  }
  console.log(check ? 'Subagents sincronitzats.' : `Sincronitzat (${changed.length} fitxers canviats).`);
}
