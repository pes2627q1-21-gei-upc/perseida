import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncAgents } from './sync-agents.mjs';

test('Codex registration preserves manual configuration and detects missing registration', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-sync-'));
  try {
    mkdirSync(join(root, '.agents/agents'), { recursive: true });
    mkdirSync(join(root, '.codex'), { recursive: true });
    writeFileSync(join(root, '.agents/agents/backend.md'), '---\nname: backend\ndescription: Backend expert\naccess: write\n---\n\nWork.\n');
    const config = join(root, '.codex/config.toml');
    writeFileSync(config, 'model = "custom"\n');
    syncAgents({ root });
    const contents = readFileSync(config, 'utf8');
    assert.match(contents, /model = "custom"/);
    assert.match(contents, /\[agents\.backend\]/);
    assert.match(contents, /config_file = "agents\/backend\.toml"/);
    assert.match(contents, /description = "Backend expert"/);
    const agent = readFileSync(join(root, '.codex/agents/backend.toml'), 'utf8');
    assert.doesNotMatch(agent, /^name\s*=/m);
    assert.doesNotMatch(agent, /^description\s*=/m);
    assert.deepEqual(syncAgents({ root, check: true }).changed, []);
    writeFileSync(config, 'model = "custom"\n');
    assert.ok(syncAgents({ root, check: true }).changed.includes('.codex/config.toml'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
