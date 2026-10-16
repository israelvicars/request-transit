import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from '../../../core/build.mjs';
import { normalizeAgent } from '../adapters/normalize-agent.mjs';

const dir = new URL('../samples/', import.meta.url);
const canaries = ['SECRET_CANARY_PROMPT_7731', 'SECRET_CANARY_OUTPUT_7731', 'SECRET_CANARY_FILE_CONTENT_7731', 'SECRET_CANARY_COMMAND_7731'];
for (const format of ['claude-code', 'codex', 'cursor']) {
  const file = new URL(`${format}-synthetic.jsonl`, dir), raw = readFileSync(file, 'utf8');
  const trace = normalizeAgent(raw, { format });
  assert.equal(trace.meta.format, format);
  assert.equal(trace.meta.synthetic, format !== 'cursor');
  assert.ok(trace.spans.length >= 16);
  assert.ok(trace.spans.some((s) => s.service === 'read'));
  assert.ok(trace.spans.some((s) => s.service === 'edit'));
  assert.ok(trace.spans.some((s) => s.service === 'shell'));
  assert.ok(trace.spans.some((s) => s.service === 'subagent'));
  assert.ok(trace.spans.some((s) => s.status === 'error' && s.statusMessage === 'denied' || s.statusMessage === 'tool error'));
  if (format !== 'cursor') assert.ok(trace.spans.some((s) => s.name.includes('npm') && s.duration >= 3000));
  if (format === 'codex') {
    assert.ok(trace.spans.some((s) => s.service === 'shell' && s.attrs['agent.wrapper'] === 'exec'));
    assert.ok(trace.spans.some((s) => s.service === 'edit' && s.attrs['agent.wrapper'] === 'exec'));
    assert.ok(trace.spans.some((s) => s.service === 'plan' && s.attrs['agent.wrapper'] === 'exec'));
    assert.ok(trace.meta.warnings.includes('ignored 2 Codex line(s) of type mystery_future_line'));
  }
  if (format === 'cursor') {
    const tools = trace.spans.filter((s) => s.spanId.startsWith('tool-'));
    assert.equal(tools[0].start, 0);
    assert.equal(tools[1].start - tools[0].start, 1250);
    assert.equal(tools[0].duration, 1000);
    assert.equal(tools[12].status, 'error');
    assert.ok(trace.meta.warnings.includes('Cursor transcripts have no timestamps or results: order only, durations are uniform'));
  }
  const out = `/private/tmp/transit-agent-${format}.html`;
  const built = build(file, { format, out });
  const html = readFileSync(built.out, 'utf8');
  for (const marker of canaries) assert.doesNotMatch(html, new RegExp(marker));
  const shown = build(file, { format, out: `${out}.args`, 'show-args': true });
  const shownHtml = readFileSync(shown.out, 'utf8');
  assert.match(shownHtml, /SECRET_CANARY_COMMAND_7731/);
  assert.doesNotMatch(shownHtml, /SECRET_CANARY_PROMPT_7731|SECRET_CANARY_OUTPUT_7731|SECRET_CANARY_FILE_CONTENT_7731/);
}
console.log('agent: synthetic Claude Code, Codex, and Cursor normalization plus privacy pass');
