import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const source = process.argv[process.argv.indexOf('--source') + 1];
if (!['claude-code', 'codex', 'cursor'].includes(source)) throw new Error('usage: node find-session.mjs --source claude-code|codex|cursor');
const cwd = resolve(process.cwd()), home = homedir();
const encoded = cwd.replaceAll('/', '-');
const roots = { 'claude-code': join(home, '.claude', 'projects'), codex: join(home, '.codex', 'sessions'), cursor: join(home, '.cursor', 'projects') };
const root = roots[source], matches = [];
function walk(dir, depth = 0) {
  if (depth > 8) return;
  let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1);
    else if (e.isFile() && e.name.endsWith('.jsonl') && (source !== 'codex' || p.includes(encoded) || !matches.some((m) => m.match))) {
      let m = source === 'codex' ? p.includes(encoded) : p.includes(encoded);
      matches.push({ path: p, match: m, mtime: (() => { try { return statSync(p).mtimeMs; } catch { return 0; } })() });
    }
  }
}
walk(root);
const scoped = matches.filter((x) => x.match), list = scoped.length ? scoped : matches;
list.sort((a, b) => b.mtime - a.mtime);
if (list[0]) console.log(list[0].path);
