// scripts/fetch.mjs: get one trace into the normalized Transit shape. All backends write the same file.
//   file (default, no auth):  node scripts/fetch.mjs file <trace.json> [--out trace.transit.json] [--trace-id ID]
//   datadog-api (headless/CI): node scripts/fetch.mjs datadog-api <trace_id>   (needs DD_API_KEY, DD_APP_KEY, DD_SITE; untested)
//   datadog-mcp (interactive): not a script. The agent calls the Datadog MCP server, saves the span
//                              JSON it returns to a file, then runs the `file` backend. See references/adapters.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normalize } from '../adapters/normalize.mjs';
const [backend, arg, ...rest] = process.argv.slice(2); const opt = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[++i];
if (backend === 'file' && arg) {
  const t = normalize(readFileSync(arg, 'utf8'), { traceId: opt['trace-id'], format: opt.format });
  const out = opt.out || arg.replace(/\.json$/, '') + '.transit.json';
  writeFileSync(out, JSON.stringify(t, null, 1) + '\n');
  console.log(`wrote ${out} (${t.spans.length} spans, from ${t.meta.format})`);
} else if (backend === 'datadog-api' && arg) {
  execFileSync('node', [new URL('../adapters/fetch-datadog-api.mjs', import.meta.url).pathname, arg, ...rest], { stdio: 'inherit' });
} else {
  console.error('usage: node scripts/fetch.mjs file <trace.json> | datadog-api <trace_id>'); process.exit(1);
}
