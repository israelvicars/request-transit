// Tolerant, privacy-first adapters for local coding-agent session JSONL.
// Deliberately extracts timing and tool identity only; payloads are never copied.
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validate, parseJsonSafe } from '../../request-transit/adapters/normalize.mjs';

const FAMILIES = new Map([
  ['read', 'read'], ['readfile', 'read'], ['glob', 'read'], ['grep', 'read'], ['ls', 'read'], ['view', 'read'],
  ['edit', 'edit'], ['write', 'edit'], ['multiedit', 'edit'], ['apply_patch', 'edit'],
  ['bash', 'shell'], ['shell', 'shell'], ['exec_command', 'shell'], ['local_shell', 'shell'],
  ['webfetch', 'web'], ['websearch', 'web'], ['web_fetch', 'web'], ['web_search', 'web'],
  ['task', 'subagent'], ['agent', 'subagent'],
]);
const isoMs = (x) => {
  if (x == null) return null;
  if (typeof x === 'number') return x < 1e12 ? x * 1000 : x;
  const n = Number(x); if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(String(x)); return Number.isFinite(t) ? t : null;
};
const key = (name) => String(name || '').toLowerCase();
const family = (name) => {
  const n = key(name);
  if (n.startsWith('mcp__') || n.includes('.')) return 'mcp';
  return FAMILIES.get(n) || 'other';
};
const contentText = (x) => Array.isArray(x) ? x.map((b) => typeof b === 'string' ? b : b && (b.text || b.content || '')).join(' ') : String(x ?? '');
const denied = (x) => /\b(denied|permission denied|not allowed|rejected|approval required)\b/i.test(contentText(x));
const errorText = (x) => /\b(error|failed|failure|exception)\b/i.test(contentText(x));
const basenameTarget = (name, args) => {
  const a = args && typeof args === 'object' ? args : {};
  const path = a.file_path || a.filePath || a.path || a.filename || a.target_file;
  if (path) return basename(String(path));
  const command = typeof args === 'string' ? args : a.command || a.cmd || a.script;
  if (command) return String(command).trim().split(/\s+/)[0].slice(0, 40);
  const query = a.pattern || a.query || a.url;
  return query ? String(query).trim().split(/\s+/)[0].slice(0, 40) : '';
};
const shortName = (name, args) => `${String(name || 'tool')}${basenameTarget(name, args) ? ` · ${basenameTarget(name, args)}` : ''}`.slice(0, 40);
const safeArgs = (args) => {
  let s = typeof args === 'string' ? args : JSON.stringify(args ?? '', (k, v) => /^(content|output|result|prompt|text)$/i.test(k) ? '[REDACTED]' : v);
  s = s.replace(/("?(?:password|passwd|token|secret|authorization|cookie)"?\s*[:=]\s*")([^"\\]{0,200})(")/ig, '$1[REDACTED]$3');
  return s.slice(0, 120);
};
const isMarker = (x) => x && typeof x === 'object' && (x._agentFormat || x.meta && x.meta.agentFormat);
const linesOf = (doc) => Array.isArray(doc) ? doc : String(doc).split(/\r?\n/).filter(Boolean).map((x) => JSON.parse(x));

export function isAgentLog(doc) {
  const lines = Array.isArray(doc) ? doc : [];
  return !!lines.length && (isMarker(lines[0]) || lines.some((x) => x && (x.type === 'session_meta' || x.type === 'response_item' || x.role === 'assistant' || x.role === 'user')));
}

function claudeEvents(lines, format, warnings) {
  const calls = new Map(), results = new Map(), times = [];
  for (const line of lines) {
    if (isMarker(line)) continue;
    const t = isoMs(line.timestamp); if (t != null) times.push(t);
    const blocks = line.message && Array.isArray(line.message.content) ? line.message.content : [];
    for (const b of blocks) {
      if (line.type === 'assistant' && b && b.type === 'tool_use' && b.id) calls.set(String(b.id), { id: String(b.id), name: b.name, args: b.input, start: t });
      if (line.type === 'user' && b && b.type === 'tool_result' && b.tool_use_id) results.set(String(b.tool_use_id), { end: t, error: !!b.is_error || denied(b.content), denied: denied(b.content), text: b.content });
    }
  }
  return [...calls.values()].map((c) => ({ ...c, result: results.get(c.id) })).filter((c) => c.start != null);
}

function codexEvents(lines, warnings) {
  const calls = new Map(), results = new Map(), times = [];
  for (const line of lines) {
    if (isMarker(line)) continue;
    const t = isoMs(line.timestamp); if (t != null) times.push(t);
    if (line.type !== 'response_item' && line.type !== 'event_msg' && line.type !== 'session_meta') { warnings.push(`ignored unknown Codex line type: ${line.type || 'missing type'}`); continue; }
    const p = line.payload || {};
    const kind = p.type || line.type;
    if (kind === 'function_call' || kind === 'custom_tool_call' || kind === 'local_shell_call') {
      const id = String(p.call_id || p.id || `${kind}-${calls.size + 1}`);
      let args = p.arguments ?? p.input ?? p.command ?? p;
      if (typeof args === 'string' && p.arguments && (args.trim().startsWith('{') || args.trim().startsWith('['))) { try { args = JSON.parse(args); } catch {} }
      calls.set(id, { id, name: p.name || (kind === 'local_shell_call' ? 'local_shell' : kind), args, start: t });
    } else if (kind === 'function_call_output' || kind === 'custom_tool_call_output' || kind === 'local_shell_call_output') {
      const id = String(p.call_id || p.id || ''); if (id) results.set(id, { end: t, error: !!p.is_error || denied(p.output), denied: denied(p.output), text: p.output });
    } else if (line.type !== 'session_meta') warnings.push(`ignored unknown Codex response item: ${kind || 'missing payload type'}`);
  }
  return [...calls.values()].map((c) => ({ ...c, result: results.get(c.id) })).filter((c) => c.start != null);
}

export function normalizeAgent(doc, options = {}) {
  const lines = linesOf(doc), format = options.format || (lines[0] && lines[0]._agentFormat) || 'claude-code';
  const warnings = [], events = format === 'codex' ? codexEvents(lines, warnings) : claudeEvents(lines, format, warnings);
  if (format === 'cursor') warnings.unshift('cursor format experimental');
  const allTimes = lines.map((l) => isoMs(l.timestamp)).filter((x) => x != null);
  for (const e of events) if (e.result && e.result.end != null) allTimes.push(e.result.end);
  const startMs = allTimes.length ? Math.min(...allTimes) : 0, endMs = Math.max(...allTimes, startMs);
  const rootId = `session-${format}`;
  const raw = [{ spanId: rootId, parentId: null, service: 'agent', name: `${format} session`, start: 0, duration: endMs - startMs, status: 'ok', kind: 'server', attrs: { 'agent.source': format } }];
  for (const e of events) {
    const end = e.result && e.result.end != null ? e.result.end : e.start;
    const result = e.result;
    const status = result && (result.error || result.denied) ? 'error' : 'ok';
    const s = { spanId: `tool-${e.id}`, parentId: rootId, service: family(e.name), name: shortName(e.name, e.args), start: Math.max(0, e.start - startMs), duration: Math.max(0, end - e.start), status, kind: 'internal', attrs: { 'agent.source': format } };
    if (status === 'error') s.statusMessage = result.denied ? 'denied' : 'tool error';
    if (options.showArgs) s.attrs['agent.args'] = safeArgs(e.args);
    raw.push(s);
  }
  const synthetic = lines.some((l) => /synthetic/i.test(String(l._comment || l.meta?.synthetic || '')));
  return validate({ traceId: `agent-${format}`, meta: { format, source: `agent.${format}`, synthetic, startUnixNs: String(Math.round(startMs * 1e6)), warnings }, spans: raw });
}

export function normalize(doc, options = {}) { return normalizeAgent(doc, options); }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2], format = process.argv.find((x) => ['claude-code', 'codex', 'cursor'].includes(x));
  if (!file) throw new Error('usage: node normalize-agent.mjs <session.jsonl> [claude-code|codex|cursor]');
  const t = normalizeAgent(readFileSync(file, 'utf8'), { format }); console.log(JSON.stringify(t, null, 2));
}
