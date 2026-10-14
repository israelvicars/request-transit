// scripts/test-normalize.mjs: adapter tests (node scripts/test-normalize.mjs)
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { normalize, parseJsonSafe } from '../adapters/normalize.mjs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const load = (f) => readFileSync(new URL('../samples/' + f, import.meta.url), 'utf8');

t('64-bit ids and ns timestamps survive JSON parsing', () => {
  const d = parseJsonSafe('{"trace_id": 11053735634281418519, "start": 1791720000000000001, "x": 12345678901234567890}');
  assert.equal(d.trace_id, '11053735634281418519');
  assert.equal(d.start, '1791720000000000001');
  assert.equal(typeof d.x, 'number');            // unrelated keys untouched
});

t('OTLP sample: services, kinds, slow and error spans', () => {
  const tr = normalize(load('otel-demo-checkout.otlp.json'));
  assert.equal(tr.meta.format, 'otlp'); assert.equal(tr.meta.synthetic, true);
  assert.equal(tr.spans.length, 45);
  assert.equal(tr.spans[0].service, 'frontend-proxy'); assert.equal(tr.spans[0].start, 0); assert.equal(tr.spans[0].parentId, null);
  const charge = tr.spans.find((s) => s.service === 'payment' && s.name === 'charge');
  assert.equal(charge.duration, 413); assert.equal(charge.start, 203);
  const email = tr.spans.find((s) => s.service === 'email');
  assert.equal(email.status, 'error'); assert.match(email.statusMessage, /order confirmation/);
  assert.equal(tr.spans.find((s) => s.name === 'HGET').peer, 'valkey-cart');
  assert.equal(tr.spans.find((s) => s.name === 'orders publish').kind, 'producer');
  for (const s of tr.spans) if (s.parentId) assert.ok(tr.spans.some((p) => p.spanId === s.parentId));
});

t('OTLP: string enums and base64 ids are accepted', () => {
  const b64 = (hex) => Buffer.from(hex, 'hex').toString('base64');
  const doc = { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'a' } }] }, scopeSpans: [{ spans: [
    { traceId: b64('0af7651916cd43dd8448eb211c80319c'), spanId: b64('b7ad6b7169203331'), name: 'GET /', kind: 'SPAN_KIND_SERVER', startTimeUnixNano: '1000000000', endTimeUnixNano: '1005000000', status: { code: 'STATUS_CODE_ERROR' } },
  ] }] }] };
  const s = normalize(doc).spans[0];
  assert.equal(normalize(doc).traceId, '0af7651916cd43dd8448eb211c80319c');
  assert.equal(s.spanId, 'b7ad6b7169203331'); assert.equal(s.kind, 'server'); assert.equal(s.status, 'error'); assert.equal(s.duration, 5);
});

t('Datadog sample: field mapping', () => {
  const tr = normalize(load('datadog-sample.json'));
  assert.equal(tr.meta.format, 'datadog');
  // 128-bit id: _dd.p.tid (upper 64, hex) + trace_id 11053735634281418519 as hex (lower 64)
  assert.equal(tr.traceId, '6705f2a000000000' + 11053735634281418519n.toString(16));
  assert.equal(tr.spans.length, 17); assert.deepEqual(tr.meta.warnings, []);
  const root = tr.spans[0];
  assert.equal(root.spanId, '9100000000007777777');     // exact, not rounded to a double
  assert.equal(root.parentId, null);                     // parent_id 0 -> root
  assert.equal(root.name, 'POST /cart/checkout');        // resource -> name
  assert.equal(root.operation, 'express.request');       // name -> operation
  assert.equal(root.kind, 'server'); assert.equal(root.duration, 540);   // ns -> ms
  const n = tr.spans.find((s) => s.service === 'notifications');
  assert.equal(n.status, 'error'); assert.equal(n.statusMessage, 'upstream SMTP relay unavailable');
  assert.equal(tr.spans.find((s) => s.name.startsWith('SELECT')).peer, 'orders-db');
  const prod = tr.spans.find((s) => s.operation === 'kafka.produce');
  assert.equal(prod.kind, 'producer'); assert.equal(prod.peer, 'kafka');
  assert.equal(tr.spans.find((s) => s.service === 'payments' && s.kind === 'internal').duration, 270);
});

t('Datadog: span.kind missing -> inferred from type', () => {
  const tr = normalize([[{ trace_id: 1, span_id: 2, parent_id: 0, service: 'w', name: 'rack.request', resource: 'GET /', type: 'web', start: 1000, duration: 2000000, error: 0 },
    { trace_id: 1, span_id: 3, parent_id: 2, service: 'w', name: 'redis.command', resource: 'GET', type: 'redis', start: 2000, duration: 1000000, error: 0, meta: { 'out.host': 'cache-1' } }]]);
  assert.equal(tr.spans[0].kind, 'server'); assert.equal(tr.spans[1].kind, 'client'); assert.equal(tr.spans[1].peer, 'cache-1');
});

t('Datadog Spans API v2 shape', () => {
  const tr = normalize(load('datadog-v2-sample.json'));
  assert.equal(tr.meta.format, 'datadog-v2'); assert.equal(tr.spans.length, 3);
  const [a, b, c] = tr.spans;
  assert.equal(a.kind, 'server'); assert.equal(a.duration, 120); assert.equal(b.parentId, '1001'); assert.equal(b.kind, 'client');
  assert.equal(c.status, 'error'); assert.equal(c.statusMessage, 'model timeout'); assert.equal(c.start, 12);
});

t('multiple traces: picks the biggest, or the requested one', () => {
  const sp = (tid, id, p) => ({ trace_id: tid, span_id: id, parent_id: p, service: 's', resource: 'r', start: 0, duration: 1e6, error: 0 });
  const doc = [sp(1, 10, 0), sp(1, 11, 10), sp(2, 20, 0)];
  assert.equal(normalize(doc).traceId, '1');
  assert.equal(normalize(doc, { traceId: '2' }).spans.length, 1);
});
console.log(`${n} tests passed`);
