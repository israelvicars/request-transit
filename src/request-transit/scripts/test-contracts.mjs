// src/request-transit/scripts/test-contracts.mjs: contract layer tests (extractors, import resolution, matcher, cache, opt-in).
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { buildIndex } from '../contracts/indexer.mjs';
import { matchTrace, normPath } from '../contracts/match.mjs';
import { normalize } from '../adapters/normalize.mjs';
import { build } from '../../../core/build.mjs';
import zod from '../contracts/extractors/zod.mjs';
import joi from '../contracts/extractors/joi.mjs';
import cv from '../contracts/extractors/class-validator.mjs';
import ts from '../contracts/extractors/ts-types.mjs';
import { show } from '../contracts/schema.mjs';
import proto from '../contracts/extractors/protobuf.mjs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const CFG = 'src/request-transit/examples/astronomy-shop/transit.config.json', CACHE = '.transit-cache/test-contracts';
rmSync(CACHE, { recursive: true, force: true });

t('zod: object, chains, optional, enum, array, refs', () => {
  const [s] = zod.symbols("export const A = z.object({ a: z.string().email(), b: z.number().int().optional(), c: z.enum(['x', 'y']), d: z.array(B), e: B.optional() });");
  assert.equal(show(s.node), '{ a: string /* email */; b?: integer; c: "x" | "y"; d: B[]; e?: B }');
});
t('joi: optional unless required(), items, integer', () => {
  const [s] = joi.symbols('const Q = Joi.object({ a: Joi.string().required(), b: Joi.number().integer(), c: Joi.array().items(Item).required() });');
  assert.equal(show(s.node), '{ a: string; b?: integer; c: Item[] }');
});
t('class-validator DTO vs plain class; decorators on their own line', () => {
  const src = 'export class D {\n  @IsString()\n  name!: string;\n  @IsOptional() @IsInt() n?: number;\n}\nexport class P { x: string; }';
  const [d, p] = cv.symbols(src);
  assert.equal(d.kind, 'class-validator'); assert.equal(show(d.node), '{ name: string; n?: integer }');
  assert.equal(p.kind, 'ts-types');
});
t('ts-types: interface with nested literal, union enum, extends', () => {
  const [a, b] = ts.symbols("interface A extends Base { x?: 'a' | 'b'; y: { z: number }[] }\ntype B = string | null;");
  assert.equal(show(a.node), '{ x?: "a" | "b"; y: { z: number }[] }'); assert.deepEqual(a.node.extends, ['Base']);
  assert.equal(b.node.t, 'string'); assert.equal(b.node.nullable, true);
});
t('protobuf: services, nested messages, enums, repeated, optional, map, oneof, imports', () => {
  const src = 'syntax = "proto3";\npackage p;\nimport "a/b.proto";\nservice S { rpc Get(Req) returns (stream p.Res) {} rpc Ping(google.protobuf.Empty) returns (google.protobuf.Empty); }\nmessage Req { string id = 1; optional int32 n = 2; repeated Item items = 3; map<string, int64> tags = 4; oneof k { string a = 5; bytes b = 6; } }\nmessage Res { Outer.Inner x = 1;\n message Inner { bool ok = 1; Kind kind = 2; }\n enum Kind { K_UNSPECIFIED = 0; K_A = 1; } }';
  const syms = Object.fromEntries(proto.symbols(src).map((x) => [x.name, x]));
  assert.equal(show(syms.Req.node), '{ id: string; n?: integer; items: Item[]; tags: {}; a?: string; b?: string /* bytes */ }');
  assert.ok(syms['Res.Inner'] && syms.Inner && syms['Res.Kind']);
  assert.deepEqual(syms.Kind.node.values, ['K_UNSPECIFIED', 'K_A']);
  assert.deepEqual(proto.imports(src), ['a/b.proto']);
  const [get, ping] = proto.routes(src);
  assert.equal(get.rpc, 'S/Get'); assert.equal(get.request.symbol, 'Req'); assert.equal(get.response.symbol, 'Res'); assert.equal(get.response.array, true);
  assert.equal(ping.request.void, true);
});
t('path normalization: params, ids, optional /api/vN and configured prefixes', () => {
  assert.ok(normPath('/users/:id').includes('/users/{}'));
  assert.ok(normPath('/users/{userId}/orders/42?x=1').includes('/users/{}/orders/{}'));
  assert.ok(normPath('/api/v2/getquote').includes('/getquote'));
  assert.ok(normPath('https://h:1/svc/x/', ['/svc']).includes('/x'));
  assert.ok(normPath('/api/checkout').includes('/api/checkout'));
});

const { index, hits: h1 } = buildIndex(CFG, { cacheDir: CACHE });
const by = (svc, k) => index.entries.find((e) => e.service === svc && (e.rpc === k || e.path === k || e.topic === k));
t('index: every extractor kind, file:line, confidence', () => {
  assert.equal(index.entries.length, 15);
  const kinds = new Set(index.entries.flatMap((e) => [e.request && e.request.kind, e.response && e.response.kind]).filter(Boolean));
  for (const k of ['zod', 'joi', 'class-validator', 'ts-types', 'openapi', 'protobuf']) assert.ok(kinds.has(k), k);
  for (const e of index.entries) { assert.match(e.source, /^services\/.+:\d+$/); assert.ok(['high', 'medium', 'low'].includes(e.confidence)); }
  assert.equal(by('shipping', '/get-quote').source, 'services/shipping/src/routes.ts:39');
});
t('cross-package resolution: @shop/schemas re-exports, z.infer aliases, DTO classes', () => {
  const fe = by('frontend', '/api/checkout');
  assert.equal(fe.request.kind, 'zod'); assert.equal(fe.request.crossPackage, true); assert.match(fe.request.source, /^packages\/shop-schemas\/src\/order\.ts:\d+/);
  assert.equal(fe.request.confidence, 'high');
  assert.match(show(fe.response.schema), /shippingCost: \{ currencyCode: string/);   // OrderResultT -> z.infer -> OrderResult -> Money
  assert.equal(by('cart', 'CartService/GetCart').request.kind, 'class-validator');
  assert.equal(by('currency', 'CurrencyService/Convert').request.confidence, 'medium');   // plain interface
  assert.deepEqual(by('email', '/send_order_confirmation').gaps, ['no response type found']);
});
t('cache: second run reads every file from cache and writes identical bytes', () => {
  const a = readFileSync(`${CACHE}/index.json`, 'utf8');
  const r2 = buildIndex(CFG, { cacheDir: CACHE });
  assert.equal(r2.misses, 0); assert.ok(r2.hits > 0);
  assert.equal(readFileSync(`${CACHE}/index.json`, 'utf8'), a);
  assert.ok(existsSync(`${CACHE}/index-${index.key}.json`));
  assert.ok(!/\d{4}-\d\d-\d\dT/.test(a), 'no timestamps');
});
t('matcher on the OTel demo checkout: matched, fallback, infra, unmatched', () => {
  const tr = normalize(readFileSync('src/request-transit/samples/otel-demo-checkout.otlp.json', 'utf8'));
  const m = matchTrace(tr, index);
  const st = (svc, name) => m.bySpan[tr.spans.find((s) => s.service === svc && (!name || s.name === name) && m.bySpan[s.spanId]).spanId];
  assert.equal(st('quote').state, 'matched');                       // /getquote vs /api/v1/getquote (prefix optional)
  assert.equal(st('checkout').state, 'matched');                    // oteldemo.CheckoutService -> CheckoutService
  assert.equal(st('cart', 'HGET').state, 'infra');
  assert.equal(st('checkout', 'orders publish').state, 'infra');
  assert.equal(st('fraud-detection').state, 'fallback');
  assert.equal(st('accounting').state, 'matched');
  assert.equal(st('product-catalog').state, 'matched');                 // via catalog.proto
  const pc = index.entries.find((e) => e.id === st('product-catalog').entryId);
  assert.equal(pc.request.kind, 'protobuf'); assert.match(show(pc.response.schema), /price_usd: \{ currency_code: string; units: integer; nanos\?: integer \}/);   // imported shop/money.proto
  assert.match(show(pc.response.schema), /region: "REGION_UNSPECIFIED" \| "REGION_US" \| "REGION_EU"/);   // nested enum
  const states = Object.values(m.bySpan).map((x) => x.state);
  assert.equal(states.filter((x) => x === 'unmatched').length, 0);
  // unmatched stays visible: a service that is not configured, and a route the service does not have
  const extra = { traceId: 't', meta: {}, spans: [
    { spanId: 'r', parentId: null, service: 'gw', name: 'GET /', start: 0, duration: 5, status: 'ok', kind: 'server' },
    { spanId: 'a', parentId: 'r', service: 'billing', name: 'GET /invoices/42', start: 1, duration: 1, status: 'ok', kind: 'server', attrs: { 'http.route': '/invoices/:id' } },
    { spanId: 'b', parentId: 'r', service: 'shipping', name: 'POST /nope', start: 1, duration: 1, status: 'ok', kind: 'server' } ] };
  const mx = matchTrace(extra, index);
  assert.equal(mx.bySpan.a.state, 'unmatched'); assert.match(mx.bySpan.a.reason, /not in the config/);
  assert.equal(mx.bySpan.b.state, 'unmatched'); assert.match(mx.bySpan.b.reason, /no entry for POST \/nope among 2 in shipping/);
});
t('opt-in: no index read without --contracts; missing index is an error, never an implicit index run', () => {
  const plain = build('src/request-transit/samples/otel-demo-checkout.otlp.json', { out: `${CACHE}/plain.html` });
  assert.equal(plain.contracts, null);
  assert.match(readFileSync(`${CACHE}/plain.html`, 'utf8'), /window\.CONTRACTS = null;/);
  assert.throws(() => build('src/request-transit/samples/otel-demo-checkout.otlp.json', { out: `${CACHE}/x.html`, contracts: `${CACHE}/nope.json` }), /transit\.mjs index/);
  const before = readdirSync(`${CACHE}/files`).length;
  const withC = build('src/request-transit/samples/otel-demo-checkout.otlp.json', { out: `${CACHE}/c.html`, contracts: `${CACHE}/index.json` });
  assert.ok(withC.contracts.entries.length > 0);
  assert.equal(readdirSync(`${CACHE}/files`).length, before);
});
rmSync(CACHE, { recursive: true, force: true });
console.log(`${n} contract tests passed`);
