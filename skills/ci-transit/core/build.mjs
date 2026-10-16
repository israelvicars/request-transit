// core/build.mjs: trace file (OTLP JSON, Datadog span JSON, Datadog Spans API v2, or normalized)
// -> one self-contained transit.html (trace, fonts and code inlined; no network at view time).
//
// usage: node core/build.mjs <trace.json> [--out out/transit.html] [--format otlp|datadog|datadog-v2|internal]
//        [--trace-id ID] [--title "..."] [--subtitle "..."] [--slow-ms N] [--ms-per-sec N]
//        [--target-seconds 9] [--redact key1,key2] [--no-default-redact]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonSafe } from '../src/request-transit/adapters/normalize.mjs';
import { pickAdapter } from './adapters.mjs';
import { existsSync } from 'node:fs';
import { matchTrace } from '../src/request-transit/contracts/match.mjs';
import { resolveVocab } from './vocab.mjs';
export const DEFAULT_INDEX = '.transit-cache/contracts/index.json';

const HERE = dirname(fileURLToPath(import.meta.url));
// attribute keys dropped before anything is rendered (span attributes can carry PII)
export const DEFAULT_REDACT = /(^|[._])(user|email|phone|token|auth|authorization|password|passwd|secret|cookie|session|card|ssn)([._]|$)|^(client|user)\.(address|ip)$|^enduser\./i;

export function redact(trace, keys = [], useDefault = true) {
  const set = new Set(keys);
  let n = 0;
  for (const s of trace.spans) {
    if (!s.attrs) continue;
    for (const k of Object.keys(s.attrs)) if (set.has(k) || (useDefault && DEFAULT_REDACT.test(k))) { delete s.attrs[k]; n++; }
  }
  trace.meta.redacted = n;
  return trace;
}

export function build(file, opt = {}) {
  const input = readFileSync(file, 'utf8');
  let doc;
  try { doc = parseJsonSafe(input); }
  catch (err) {
    doc = input.split(/\r?\n/).filter(Boolean).map((line) => parseJsonSafe(line));
  }
  const adapter = pickAdapter(doc, opt.format);
  const trace = adapter.normalize(doc, { format: adapter.format, traceId: opt['trace-id'], showArgs: !!opt['show-args'] });
  redact(trace, opt.redact ? String(opt.redact).split(',') : [], !opt['no-default-redact']);
  const vizOpts = {};
  if (opt.title) vizOpts.title = opt.title;
  if (opt.subtitle) vizOpts.subtitle = opt.subtitle;
  if (opt['slow-ms']) vizOpts.slowMs = Number(opt['slow-ms']);
  if (opt['ms-per-sec']) vizOpts.msPerSec = Number(opt['ms-per-sec']);
  if (opt['target-seconds']) vizOpts.targetSeconds = Number(opt['target-seconds']);
  if (adapter.format === 'gh-actions') vizOpts.ciStepsAsStations = true;
  vizOpts.vocab = resolveVocab(opt.vocab || (adapter.format === 'gh-actions' ? 'ci' : adapter.format && ['claude-code', 'codex', 'cursor'].includes(adapter.format) ? 'agent' : undefined));
  // contracts are opt-in: only an explicit --contracts [index.json] reads an index, and it never builds one
  let contracts = null;
  if (opt.contracts) {
    const ix = opt.contracts === true ? DEFAULT_INDEX : opt.contracts;
    if (!existsSync(ix)) throw new Error(`--contracts: no index at ${ix}. Build one first (ask the user): node src/request-transit/scripts/transit.mjs index --config transit.config.json`);
    contracts = matchTrace(trace, JSON.parse(readFileSync(ix, 'utf8')));
  }
  const js = `window.TRACE = ${JSON.stringify(trace)};\nwindow.VIZ_OPTS = ${JSON.stringify(vizOpts)};\nwindow.CONTRACTS = ${JSON.stringify(contracts)};`.replace(/<\//g, '<\\/');
  const face = (w) => `@font-face { font-family: "Transit Sans"; font-weight: ${w}; font-style: normal; src: url(data:font/woff;base64,${readFileSync(join(HERE, `fonts/arimo-${w}.woff`)).toString('base64')}) format("woff"); }`;
  const tpl = readFileSync(join(HERE, 'transit.template.html'), 'utf8');
  if (!tpl.includes('/*__TRACE_DATA__*/') || !tpl.includes('/*__FONTS__*/')) throw new Error('template placeholder missing');
  const html = tpl.replace('/*__FONTS__*/', () => face(400) + '\n  ' + face(700)).replace('/*__TRACE_DATA__*/', () => js);
  const out = resolve(opt.out || 'out/transit.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return { out, trace, contracts };
}

if (process.argv[1] && process.argv[1].endsWith('/build.mjs')) {
  await (await import('./setup.mjs')).ensureSetup({ need: [] });   // node version only; the HTML needs no deps
  const argv = process.argv.slice(2); const opt = {}; const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { pos.push(argv[i]); continue; }
    const k = argv[i].slice(2);
    if (k.startsWith('no-')) opt[k] = true;
    else if ((k === 'contracts' || k === 'show-args') && (!argv[i + 1] || argv[i + 1].startsWith('--'))) opt[k] = true;
    else opt[k] = argv[++i];
  }
  if (!pos[0]) { console.error('usage: node core/build.mjs <trace.json> [--out out/transit.html] [--title ...]'); process.exit(1); }
  const { out, trace, contracts } = build(pos[0], opt);
  for (const w of trace.meta.warnings) console.error('warning:', w);
  console.log(`wrote ${out} (${trace.spans.length} spans, ${trace.meta.format}${trace.meta.synthetic ? ', synthetic' : ''}, ${trace.meta.redacted} attrs redacted${contracts ? `, contracts: ${Object.values(contracts.bySpan).filter((m) => m.state === 'matched' || m.state === 'fallback').length} matched / ${Object.values(contracts.bySpan).filter((m) => m.state === 'unmatched').length} unmatched / ${Object.values(contracts.bySpan).filter((m) => m.state === 'infra').length} infra` : ''})`);
}
