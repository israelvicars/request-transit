// scripts/test-ui.mjs: Playwright keyboard + click tests for the interactive page (not the video).
// usage: node scripts/test-ui.mjs [out/otel/transit.html] [--shot out/ui/panel.png]
import { pathToFileURL } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
await (await import('./setup.mjs')).ensureSetup({ need: ['deps', 'browser'] });
const { chromium } = await import('playwright');
const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--')) || 'out/otel/transit.html';
const shot = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : null;
const cfile = argv.includes('--contracts-page') ? argv[argv.indexOf('--contracts-page') + 1] : null;
const cshot = argv.includes('--contracts-shot') ? argv[argv.indexOf('--contracts-shot') + 1] : null;
const sdir = argv.includes('--scroll-shots') ? argv[argv.indexOf('--scroll-shots') + 1] : null;
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const url = pathToFileURL(resolve(file)).href;
await page.goto(url + '?paused');
const st = () => page.evaluate(() => window.TRANSIT_UI.state());
const hops = await page.evaluate(() => window.TRANSIT_UI.hops);
ok(await page.isVisible('#panel'), 'panel visible in interactive page');
ok(hops.length > 2, `${hops.length} hops`);
await page.locator('body').click({ position: { x: 1300, y: 950 } }); // focus page, no hit
await page.keyboard.press('Home');
await page.keyboard.press('n');
let s = await st();
ok(s.hop === 0 && s.selected === hops[0].spanId, 'N selects first hop');
ok(Math.abs(s.t - hops[0].t) < 1e-9, 'N jumps to that hop start');
ok((await page.textContent('#panel')).includes('HOP 1 /'), 'panel shows HOP 1');
await page.keyboard.press('Shift+ArrowRight'); s = await st();
ok(s.hop === 1, 'Shift+Right next hop');
await page.keyboard.press('n'); await page.keyboard.press('p'); s = await st();
ok(s.hop === 1, 'N then P returns');
await page.keyboard.press('Shift+ArrowLeft'); s = await st();
ok(s.hop === 0, 'Shift+Left previous hop');
await page.keyboard.press('ArrowDown'); ok((await st()).hop === 1, 'ArrowDown next hop');
await page.keyboard.press('ArrowUp'); ok((await st()).hop === 0, 'ArrowUp previous hop');
ok(new URL(page.url()).hash === '#span=' + encodeURIComponent(hops[0].spanId), 'URL hash carries selected span');
await page.keyboard.press('End'); s = await st(); ok(s.t > 1 && !s.playing, 'End goes to end');
await page.keyboard.press('Home'); s = await st(); ok(s.t === 0, 'Home goes to 0');
for (const [k, v] of [['1', 0.5], ['3', 2], ['2', 1]]) { await page.keyboard.press(k); ok((await st()).speed === v, `key ${k} -> ${v}x`); }
await page.click('#speed button[data-s="2"]'); ok((await st()).speed === 2, 'speed button 2x');
await page.keyboard.press('?'); ok((await st()).help && await page.isVisible('#help'), '? opens help');
await page.keyboard.press('Escape'); ok(!(await st()).help, 'Esc closes help');
// click a station (canvas coords == page coords: canvas at 0,0, 1200 wide)
const box = await page.locator('#stage').boundingBox();
const target = hops[Math.min(3, hops.length - 1)];
const stn = (await page.evaluate(() => window.TRANSIT_UI.stations)).find((n) => n.id === target.to);
await page.keyboard.press('Home');
await page.mouse.click(box.x + stn.x, box.y + stn.y);
s = await st(); ok(s.selected && hops[s.hop] && hops[s.hop].to === target.to, `click station ${target.to} selects a hop into it`);
// click a line segment
const ep = await page.evaluate(() => window.TRANSIT_UI.edgePoint(1));
await page.mouse.click(box.x + ep.x, box.y + ep.y); s = await st();
ok(s.hop >= 0 && hops[s.hop].from === hops[1].from && hops[s.hop].to === hops[1].to, 'click line selects a hop on that edge');
// click a train: go to mid-flight of hop 2
const tr = await page.evaluate(() => { const h = window.TRANSIT_UI.hops[2]; const t = h.t + 3 / 24; return t; });
// set app time via scrub to keep UI state consistent
await page.locator('#scrub').evaluate((el, t) => { el.value = t; el.dispatchEvent(new Event('input')); }, tr);
const pos = await page.evaluate((t) => window.VIZ.trainsAt(t), tr);
ok(pos.length > 0, `${pos.length} train(s) on screen at t=${tr.toFixed(2)}`);
const tp = (await page.evaluate(() => window.TRANSIT_UI.trainPoints()))[0];
await page.mouse.click(box.x + tp.x, box.y + tp.y); s = await st();
ok(s.selected === tp.spanId, 'click train selects its hop');
await page.keyboard.press('Escape'); await page.keyboard.press('Space'); await page.waitForTimeout(400); await page.keyboard.press('Space');
s = await st(); ok(!s.playing && s.selected, 'pause auto-selects the hop in progress');
// parent/children link click
await page.keyboard.press('Home'); await page.keyboard.press('n'); await page.keyboard.press('n');
const link = page.locator('#panel a[data-span]').first();
const linkId = await link.getAttribute('data-span');
await link.click(); s = await st(); ok(s.selected === linkId, 'parent/child link selects that span');
ok((await page.textContent('#panel')).includes('Contracts not indexed'), 'not-indexed note when built without --contracts');
// redesigned panel pieces
await page.keyboard.press('Home'); for (let k = 0; k < 4; k++) await page.keyboard.press('n');
ok(await page.isVisible('#panel .sign .bul'), 'station-sign header with line bullet');
ok(await page.isVisible('#panel .wf .wf-span'), 'mini waterfall');
const stops = await page.locator('#panel .crumbs .stop').count(); ok(stops >= 2, `breadcrumb has ${stops} stops`);
await page.locator('#panel .crumbs .stop').first().click(); s = await st();
ok(s.selected === (await page.evaluate(() => window.TRACE.spans.find((x) => !x.parentId).spanId)), 'breadcrumb first stop selects the root');
await page.keyboard.press('Home'); await page.keyboard.press('n'); await page.keyboard.press('n');
ok(await page.locator('#panel .ag').count() >= 1, 'attributes grouped');
ok(await page.locator('#panel button:has-text("Copy")').count() === 0, 'no copy buttons');
// deep link
const p2 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await p2.goto(url + '#span=' + encodeURIComponent(hops[2].spanId));
s = await p2.evaluate(() => window.TRANSIT_UI.state());
ok(s.selected === hops[2].spanId && !s.playing, 'deep link #span= selects and pauses');
if (shot) {
  mkdirSync(dirname(resolve(shot)), { recursive: true });
  await p2.keyboard.press('Shift+ArrowRight'); await p2.keyboard.press('ArrowRight'); await p2.keyboard.press('ArrowRight'); await p2.keyboard.press('ArrowRight');
  await p2.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1600, height: 900 } });
  console.log('screenshot', resolve(shot));
}
if (cfile) {
  const pc = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const curl = pathToFileURL(resolve(cfile)).href;
  await pc.goto(curl + '?paused');
  const ch = await pc.evaluate(() => window.TRANSIT_UI.hops);
  let pg = pc;
  const sel = async (pred) => { const h = ch.find(pred); pg = await browser.newPage({ viewport: { width: 1600, height: 1000 } }); await pg.goto(curl + '?paused#span=' + encodeURIComponent(h.spanId)); return pg.textContent('#panel'); };
  let txt = await sel((h) => h.to === 'checkout');
  ok(/MATCHED/.test(txt) && /Request/i.test(txt) && /userCurrency/.test(txt) && /validator · class-validator/.test(txt), 'checkout hop: matched, request card with fields + validator badge');
  ok(await pg.locator('#panel .card .conf').count() >= 2, 'confidence dots on both cards');
  txt = await sel((h) => h.to === 'email');
  ok(/No response type found\. Not guessed/.test(txt), 'email hop: response gap shown honestly');
  txt = await sel((h) => h.to === 'valkey-cart');
  ok(/Infrastructure hop/.test(txt), 'valkey hop: infrastructure');
  txt = await sel((h) => h.to === 'product-catalog');
  ok(/MATCHED/.test(txt) && /schema · protobuf/.test(txt) && /catalog\.proto/.test(txt) && /price_usd/.test(txt), 'product-catalog hop: matched from catalog.proto');
  txt = await sel((h) => h.to === 'fraud-detection');
  ok(/FALLBACK/.test(txt) && /medium/.test(txt), 'fraud-detection hop: producer-shape fallback, medium');
  txt = await sel((h) => h.to === 'frontend');
  ok(/shared package/.test(txt) && /packages\/shop-schemas/.test(txt), 'frontend hop: cross-package schema source');
  ok((await pc.textContent('#hops')).includes('matched'), 'hop table shows contract state');
  // one hop model everywhere: callee is the station, caller is 'from', both timings labeled
  const view = async () => pg.evaluate(() => ({
    sn: document.querySelector('#panel .sign .sn').textContent, sub: document.querySelector('#panel .sign .sub').textContent,
    h2: document.querySelector('#panel h2').textContent, here: document.querySelector('#panel .crumbs .here .sl').textContent,
    tl: [...document.querySelectorAll('#panel .trow .tl')].map((e) => e.textContent), card: (document.querySelector('#panel .match') || {}).textContent || '' }));
  await sel((h) => h.to === 'shipping' && /get-quote/.test(JSON.stringify(h)) || h.to === 'shipping');
  let v = await view();
  ok(v.sn === 'shipping' && v.here === 'shipping' && /from\s+.*checkout/.test(v.sub) && v.h2 === 'POST /get-quote' && /get-quote/.test(v.card), `shipping hop consistent: header/title/breadcrumb/contract all describe the callee (${v.h2})`);
  ok(v.tl.length === 2 && /^client · checkout/.test(v.tl[0]) && /^server · shipping/.test(v.tl[1]), 'client and server timings both labeled');
  await sel((h) => h.to === 'valkey-cart'); v = await view();
  ok(v.sn === 'valkey-cart' && v.here === 'valkey-cart' && v.h2 === 'HGET' && /from\s+.*cart/.test(v.sub) && /no server span/.test(v.tl[0]), 'infra hop consistent: station is the dependency, client span is the hop');
  // selecting the server span directly lands on the same hop as selecting the client span
  const same = await pg.evaluate(() => { const h = window.TRANSIT_UI.hops.find((x) => x.to === 'payment'); return h; });
  const srvId = await pg.evaluate(() => window.TRACE.spans.find((x) => x.service === 'payment' && x.kind === 'server').spanId);
  pg = await browser.newPage({ viewport: { width: 1600, height: 1000 } }); await pg.goto(curl + '?paused#span=' + encodeURIComponent(srvId));
  ok((await pg.evaluate(() => window.TRANSIT_UI.state().hop)) === ch.findIndex((h) => h.spanId === same.spanId), 'server span and client span select the same hop');
  // scrolling: page never scrolls, panel body scrolls on its own, header sticks, selection resets scroll
  for (const [w, hgt] of [[1280, 800], [1280, 600]]) {
    const ps = await browser.newPage({ viewport: { width: w, height: hgt } });
    const fe = ch.find((h) => h.to === 'frontend');   // longest panel: big cross-package request + response
    await ps.goto(curl + '?paused#span=' + encodeURIComponent(fe.spanId));
    const m0 = await ps.evaluate(() => { const d = document.scrollingElement, b = document.querySelector('#panel .pbody'), st = document.getElementById('stage').getBoundingClientRect();
      return { sh: d.scrollHeight, sw: d.scrollWidth, ih: innerHeight, iw: innerWidth, bsh: b.scrollHeight, bch: b.clientHeight, ov: getComputedStyle(b).overflowY, osb: getComputedStyle(b).overscrollBehaviorY, stB: st.bottom, stR: st.right }; });
    ok(m0.sh <= m0.ih && m0.sw <= m0.iw, `${w}x${hgt}: no page scrollbar (${m0.sw}x${m0.sh})`);
    ok(m0.stB <= m0.ih + 0.5 && m0.stR <= m0.iw - 400 + 0.5, `${w}x${hgt}: whole map visible beside the panel`);
    ok(m0.ov === 'auto' && m0.osb === 'contain', `${w}x${hgt}: panel body overflow-y:auto, overscroll contain`);
    ok(m0.bsh > m0.bch, `${w}x${hgt}: longest panel overflows its body (${m0.bsh} > ${m0.bch})`);
    const bb = await ps.locator('#panel .pbody').boundingBox();
    await ps.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await ps.mouse.wheel(0, 2000); await ps.waitForTimeout(250);
    const m1 = await ps.evaluate(() => ({ top: document.querySelector('#panel .pbody').scrollTop, y: scrollY, se: document.scrollingElement.scrollTop, sign: document.querySelector('#panel .sign').getBoundingClientRect().top, stage: document.getElementById('stage').getBoundingClientRect().top }));
    ok(m1.top > 0 && m1.y === 0 && m1.se === 0 && m1.stage === 0, `${w}x${hgt}: wheel scrolls only the panel body (scrollTop ${m1.top})`);
    ok(m1.sign === 0, `${w}x${hgt}: station-sign header stays on top`);
    if (sdir) { mkdirSync(resolve(sdir), { recursive: true }); await ps.screenshot({ path: join(resolve(sdir), `panel-scrolled-${w}x${hgt}.png`) }); console.log('screenshot', join(resolve(sdir), `panel-scrolled-${w}x${hgt}.png`)); }
    const sbox = await ps.locator('#stage').boundingBox();
    await ps.mouse.move(sbox.x + 50, sbox.y + sbox.height - 50); await ps.mouse.wheel(0, 1500); await ps.waitForTimeout(150);
    ok((await ps.evaluate(() => [scrollY, document.getElementById('stage').getBoundingClientRect().top])).every((x) => x === 0), `${w}x${hgt}: map does not scroll`);
    await ps.focus('#panel .pbody');
    const before = (await ps.evaluate(() => window.TRANSIT_UI.state())).hop;
    await ps.keyboard.press('n');
    const after = await ps.evaluate(() => ({ hop: window.TRANSIT_UI.state().hop, top: document.querySelector('#panel .pbody').scrollTop }));
    ok(after.hop === before + 1, `${w}x${hgt}: keyboard works with the panel focused`);
    ok(after.top === 0, `${w}x${hgt}: new hop resets panel scroll to top`);
    await ps.keyboard.press('?'); ok((await ps.evaluate(() => window.TRANSIT_UI.state().help)), `${w}x${hgt}: ? works with the panel focused`); await ps.keyboard.press('Escape');
    if (sdir && hgt === 800) { await ps.screenshot({ path: join(resolve(sdir), `panel-top-${w}x${hgt}.png`) }); console.log('screenshot', join(resolve(sdir), `panel-top-${w}x${hgt}.png`)); }
    await ps.close();
  }
  if (cshot) {
    await sel((h) => h.to === 'shipping');
    mkdirSync(dirname(resolve(cshot)), { recursive: true });
    await pg.screenshot({ path: cshot, clip: { x: 0, y: 0, width: 1600, height: 900 } });
    console.log('screenshot', resolve(cshot));
  }
}
// render mode hides UI
const p3 = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
await p3.addInitScript(() => { window.__RENDER_MODE = true; });
await p3.goto(url + '#span=' + encodeURIComponent(hops[2].spanId));
ok(!(await p3.isVisible('#panel')) && !(await p3.isVisible('#controls')), 'render mode hides panel and controls');
ok((await p3.evaluate(() => window.TRANSIT_UI.state())).selected === null, 'render mode ignores #span');
await browser.close();
console.log(fails ? `${fails} failure(s)` : 'all UI tests pass');
process.exit(fails ? 1 : 0);
