// Generate the plugin-facing SKILL.md wrapper for every skill in skills/*.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skills = readdirSync(join(ROOT, 'skills'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && readFileSync(join(ROOT, 'skills', e.name, 'SKILL.md'), 'utf8'))
  .map((e) => e.name).sort();

function generated(name) {
  const src = readFileSync(join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');
  const note = `\n> Installed as a Claude Code plugin: \`CLAUDE_PLUGIN_ROOT\` is the repo root, which holds\n> \`skills/${name}/\` and \`core/\`. Generated from \`skills/${name}/SKILL.md\` by \`scripts/build-plugin-skill.mjs\`; do not edit.\n`;
  const end = src.indexOf('\n---', 4) + 4;
  return src.slice(0, end) + '\n' + note + src.slice(end);
}

let stale = false;
for (const name of skills) {
  const out = join(ROOT, 'plugin/skills', name, 'SKILL.md');
  const text = generated(name);
  if (process.argv.includes('--check')) {
    let cur = ''; try { cur = readFileSync(out, 'utf8'); } catch {}
    if (cur !== text) { console.error(`plugin SKILL.md is stale: ${out}`); stale = true; }
  } else { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, text); console.log(`wrote plugin/skills/${name}/SKILL.md`); }
}
if (process.argv.includes('--check')) {
  if (stale) { console.error('run node scripts/build-plugin-skill.mjs'); process.exit(1); }
  console.log(`plugin SKILL.md files up to date (${skills.length})`);
}
