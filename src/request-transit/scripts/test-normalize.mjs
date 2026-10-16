// src/request-transit/scripts/test-normalize.mjs: adapter tests (node src/request-transit/scripts/test-normalize.mjs)
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
t('PostHog tracing sample: auto-detected, same trip as the OTLP original', () => {
  const ph = normalize(load('posthog-checkout.json')), ot = normalize(load('otel-demo-checkout.otlp.json'));
  assert.equal(ph.meta.format, 'posthog'); assert.equal(ph.meta.synthetic, true);
  assert.equal(ph.traceId, ot.traceId); assert.equal(ph.spans.length, ot.spans.length);
  const key = (s) => [s.spanId, s.parentId, s.service, s.name, s.kind, s.status, s.start.toFixed(3), s.duration.toFixed(3)].join('|');
  assert.deepEqual(ph.spans.map(key).sort(), ot.spans.map(key).sort());
  assert.match(ph.spans.find((s) => s.service === 'email').statusMessage, /SMTP timeout/);
  assert.equal(ph.spans.find((s) => s.name === 'HGET').peer, 'valkey-cart');
});

t('PostHog: bare array, base64 ids (HogQL), zero parent, end_time fallback, hasMore warning', () => {
  const b64 = (hex) => Buffer.from(hex, 'hex').toString('base64');
  const sp = (id, parent, ts, durNs, extra = {}) => ({ trace_id: b64('0af7651916cd43dd8448eb211c80319c'), span_id: b64(id), parent_span_id: parent,
    name: 'op' + id.slice(-1), kind: 2, service_name: 'svc' + id.slice(-1), status_code: 0, timestamp: ts, duration_nano: durNs, ...extra });
  const arr = [sp('00000000000000a1', '0000000000000000', '2026-01-01T00:00:00.000000123Z', 5e6),
    sp('00000000000000a2', b64('00000000000000a1'), '2026-01-01T00:00:00.001500Z', undefined, { end_time: '2026-01-01T00:00:00.003500Z', kind: 3, status_code: 2, attributes: { 'otel.status_description': 'boom' } })];
  const t1 = normalize(arr);
  assert.equal(t1.meta.format, 'posthog'); assert.equal(t1.traceId, '0af7651916cd43dd8448eb211c80319c');
  assert.equal(t1.spans[0].spanId, '00000000000000a1'); assert.equal(t1.spans[0].parentId, null);
  assert.equal(t1.spans[1].parentId, '00000000000000a1');
  assert.equal(t1.spans[1].kind, 'client'); assert.equal(t1.spans[1].status, 'error'); assert.equal(t1.spans[1].statusMessage, 'boom');
  assert.ok(Math.abs(t1.spans[1].start - 1.499877) < 1e-6);   // ns precision kept from ISO strings
  assert.equal(t1.spans[1].duration, 2);
  const t2 = normalize({ results: arr, hasMore: true, nextOffset: 2 });
  assert.ok(t2.meta.warnings.some((w) => /hasMore/.test(w)));
});
t('Tempo v2 sample: auto-detected, base64 ids + string enums, same trip as the OTLP original', () => {
  const tp = normalize(load('tempo-checkout.json')), ot = normalize(load('otel-demo-checkout.otlp.json'));
  assert.equal(tp.meta.format, 'tempo'); assert.equal(tp.meta.synthetic, true);
  assert.equal(tp.traceId, ot.traceId);
  assert.deepEqual(tp.spans.map((s) => [s.spanId, s.parentId, s.service, s.kind, s.status, s.start, s.duration]),
    ot.spans.map((s) => [s.spanId, s.parentId, s.service, s.kind, s.status, s.start, s.duration]));
});
t('Tempo v1 batches + instrumentationLibrarySpans, v2 trace.batches, PARTIAL warning, empty trace', () => {
  const sp = (id, parent, kind, extra = {}) => ({ traceId: Buffer.from('0af7651916cd43dd8448eb211c80319c', 'hex').toString('base64'),
    spanId: Buffer.from(id, 'hex').toString('base64'), ...(parent ? { parentSpanId: Buffer.from(parent, 'hex').toString('base64') } : {}),
    name: 'op-' + id.slice(-2), kind, startTimeUnixNano: '1700000000000000000', endTimeUnixNano: '1700000000005000000', ...extra });
  const rs = (svc, spans, key = 'scopeSpans') => ({ resource: { attributes: [{ key: 'service.name', value: { stringValue: svc } }] }, [key]: [{ spans }] });
  const batches = [rs('api', [sp('00000000000000a1', null, 'SPAN_KIND_SERVER')], 'instrumentationLibrarySpans'),
    rs('db-client', [sp('00000000000000a2', '00000000000000a1', 3, { status: { code: 'STATUS_CODE_ERROR', message: 'timeout' } })])];
  const v1 = normalize({ batches });
  assert.equal(v1.meta.format, 'tempo'); assert.equal(v1.traceId, '0af7651916cd43dd8448eb211c80319c');
  assert.equal(v1.spans.length, 2); assert.equal(v1.spans[1].parentId, '00000000000000a1');
  assert.equal(v1.spans[1].kind, 'client'); assert.equal(v1.spans[1].status, 'error'); assert.equal(v1.spans[1].statusMessage, 'timeout');
  const v2 = normalize({ trace: { batches }, status: 'PARTIAL', message: 'trace exceeds max size' });
  assert.equal(v2.spans.length, 2); assert.ok(v2.meta.warnings.some((w) => /PARTIAL.*max size/.test(w)));
  assert.throws(() => normalize({ trace: {} }), /no spans/);
});
t('X-Ray sample: auto-detected, same trip as the OTLP original', () => {
  const xr = normalize(load('xray-checkout.json')), ot = normalize(load('otel-demo-checkout.otlp.json'));
  assert.equal(xr.meta.format, 'xray'); assert.equal(xr.meta.synthetic, true);
  assert.equal(xr.traceId, ot.traceId);
  assert.equal(xr.spans.length, ot.spans.length);
  assert.ok(xr.meta.warnings.some((w) => /inferred/.test(w)));
  const byO = new Map(ot.spans.map((s) => [s.spanId, s]));
  for (const s of xr.spans) {
    const o = byO.get(s.spanId); assert.ok(o, s.spanId);
    assert.equal(s.parentId, o.parentId); assert.equal(s.service, o.service); assert.equal(s.status, o.status === 'unset' ? 'ok' : o.status);
    assert.ok(Math.abs(s.start - o.start) < 0.002 && Math.abs(s.duration - o.duration) < 0.002, `${s.spanId} timing`);
    assert.equal(s.kind, o.kind, `${s.service} ${o.name} kind`);
  }
  const email = xr.spans.find((s) => s.service === 'email' && !s.parentId === false && s.kind === 'server');
  assert.equal(email.status, 'error'); assert.match(email.statusMessage, /order confirmation/);
  assert.equal(xr.spans.find((s) => s.kind === 'producer').peer, 'SQS');
});

t('X-Ray: bare segment docs, subsegments, namespaces, fault/error/throttle, in-progress', () => {
  const tid = '1-5f84c7a5-2b0c4a1e9d3f6b7a8c9d0e1f';
  const front = { id: 'a000000000000001', trace_id: tid, name: 'web', start_time: 1700000000.0, end_time: 1700000000.5,
    http: { request: { method: 'GET', url: 'https://x.example/cart?id=1' }, response: { status: 500 } }, fault: true,
    cause: { exceptions: [{ type: 'TimeoutError', message: 'downstream timed out' }] },
    subsegments: [
      { id: 'b000000000000001', name: 'render', start_time: 1700000000.01, end_time: 1700000000.02 },
      { id: 'b000000000000002', name: 'DynamoDB', namespace: 'aws', start_time: 1700000000.03, end_time: 1700000000.08, throttle: true, error: true,
        http: { response: { status: 429 } }, aws: { operation: 'GetItem', table_name: 'carts' } },
      { id: 'b000000000000003', name: 'api', namespace: 'remote', start_time: 1700000000.1, end_time: 1700000000.45, fault: true },
    ] };
  const api = { id: 'c000000000000001', trace_id: tid, parent_id: 'b000000000000003', name: 'api', start_time: 1700000000.101, in_progress: true,
    subsegments: [{ id: 'd000000000000001', name: 'work', start_time: 1700000000.102, end_time: 1700000000.3 }] };
  const inferred = { id: 'e000000000000001', trace_id: tid, parent_id: 'b000000000000002', name: 'DynamoDB', inferred: true, start_time: 1700000000.03, end_time: 1700000000.08 };
  const tr = normalize(JSON.stringify([front, JSON.stringify(api), inferred].map((d) => typeof d === 'string' ? { Document: d } : d)));
  assert.equal(tr.meta.format, 'xray'); assert.equal(tr.traceId, '5f84c7a52b0c4a1e9d3f6b7a8c9d0e1f');
  const by = Object.fromEntries(tr.spans.map((s) => [s.spanId, s]));
  assert.equal(tr.spans.length, 6);
  assert.equal(by.a000000000000001.name, 'GET /cart'); assert.equal(by.a000000000000001.kind, 'server');
  assert.equal(by.a000000000000001.statusMessage, 'TimeoutError: downstream timed out');
  assert.equal(by.b000000000000001.kind, 'internal'); assert.equal(by.b000000000000001.service, 'web'); assert.equal(by.b000000000000001.parentId, 'a000000000000001');
  const ddb = by.b000000000000002;
  assert.equal(ddb.kind, 'client'); assert.equal(ddb.peer, 'DynamoDB'); assert.equal(ddb.status, 'error'); assert.equal(ddb.statusMessage, 'throttled (HTTP 429)');
  assert.equal(ddb.attrs['rpc.method'], 'GetItem'); assert.equal(ddb.attrs['db.name'], 'carts');
  assert.equal(by.c000000000000001.parentId, 'b000000000000003'); assert.equal(by.c000000000000001.duration, 199);
  assert.equal(by.d000000000000001.service, 'api');
  assert.ok(tr.meta.warnings.some((w) => /in progress/.test(w)) && tr.meta.warnings.some((w) => /inferred/.test(w)));
  assert.throws(() => normalize({ TraceSummaries: [{ Id: tid }] }), /GetTraceSummaries/);
});

console.log(`${n} tests passed`);
