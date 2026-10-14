// scripts/build-plugin-skill.mjs: writes plugin/skills/request-transit/SKILL.md for the Claude Code plugin.
// Claude Code (2.1.x) only loads plugin skills from a skills folder inside the plugin, not a SKILL.md at
// the plugin root, so the plugin gets a generated copy of the root SKILL.md that points at the plugin root.
// `--check` exits 1 when the copy is stale (run by npm test).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(ROOT, 'plugin/skills/request-transit/SKILL.md');
const src = readFileSync(join(ROOT, 'SKILL.md'), 'utf8');
const note = '\n> Installed as a Claude Code plugin: `<skill>` below is `${CLAUDE_PLUGIN_ROOT}` (the plugin root, which holds\n> `scripts/`, `engine/`, `adapters/`). Generated from the repo-root SKILL.md by scripts/build-plugin-skill.mjs; do not edit.\n';
const end = src.indexOf('\n---', 4) + 4;              // after the closing frontmatter marker
const text = src.slice(0, end) + '\n' + note + src.slice(end);
if (process.argv.includes('--check')) {
  let cur = ''; try { cur = readFileSync(out, 'utf8'); } catch {}
  if (cur !== text) { console.error('plugin SKILL.md is stale: run node scripts/build-plugin-skill.mjs'); process.exit(1); }
  console.log('plugin SKILL.md up to date');
} else { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, text); console.log('wrote plugin/skills/request-transit/SKILL.md'); }
