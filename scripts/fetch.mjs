// scripts/fetch.mjs: get one trace into the normalized Transit shape. All backends write the same file.
//   file (default, no auth):  node scripts/fetch.mjs file <trace.json> [--out trace.transit.json] [--trace-id ID]
//   datadog-api (headless/CI): node scripts/fetch.mjs datadog-api <trace_id>   (needs DD_API_KEY, DD_APP_KEY, DD_SITE; untested)
//   posthog-api (headless):  node scripts/fetch.mjs posthog-api <trace_id> (POSTHOG_API_KEY, POSTHOG_HOST, POSTHOG_PROJECT_ID; untested)
//   posthog-mcp (interactive): agent calls apm-trace-get, saves the JSON, then uses `file`.
//   datadog-mcp (interactive): not a script. The agent calls the Datadog MCP server, saves the span
//                              JSON it returns to a file, then runs the `file` backend. See references/adapters.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normalize } from '../adapters/normalize.mjs';
import { ensureSetup } from './setup.mjs';
await ensureSetup({ need: [] });
const runChild = (file, args) => { try { execFileSync('node', [new URL(file, import.meta.url).pathname, ...args], { stdio: 'inherit' }); } catch (e) { process.exit(e.status || 1); } };
const [backend, arg, ...rest] = process.argv.slice(2); const opt = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[++i];
if (backend === 'file' && arg) {
  const t = normalize(readFileSync(arg, 'utf8'), { traceId: opt['trace-id'], format: opt.format });
  const out = opt.out || arg.replace(/\.json$/, '') + '.transit.json';
  writeFileSync(out, JSON.stringify(t, null, 1) + '\n');
  console.log(`wrote ${out} (${t.spans.length} spans, from ${t.meta.format})`);
} else if (backend === 'datadog-api' && arg) {
  runChild('../adapters/fetch-datadog-api.mjs', [arg, ...rest]);
} else if (backend === 'posthog-api' && arg) {
  runChild('../adapters/fetch-posthog-api.mjs', [arg, ...rest]);
} else {
  console.error('usage: node scripts/fetch.mjs file <trace.json> | datadog-api <trace_id> | posthog-api <trace_id>'); process.exit(1);
}
