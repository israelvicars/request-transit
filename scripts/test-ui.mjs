// scripts/test-ui.mjs: Playwright keyboard + click tests for the interactive page (not the video).
// usage: node scripts/test-ui.mjs [out/otel/transit.html] [--shot out/ui/panel.png]
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
await (await import('./setup.mjs')).ensureSetup({ need: ['deps', 'browser'] });
const { chromium } = await import('playwright');
const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--')) || 'out/otel/transit.html';
const shot = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : null;
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
ok((await page.textContent('#panel')).includes('Contracts not indexed'), 'contract placeholder present');
// deep link
const p2 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await p2.goto(url + '#span=' + encodeURIComponent(hops[2].spanId));
s = await p2.evaluate(() => window.TRANSIT_UI.state());
ok(s.selected === hops[2].spanId && !s.playing, 'deep link #span= selects and pauses');
if (shot) {
  mkdirSync(dirname(resolve(shot)), { recursive: true });
  await p2.keyboard.press('Shift+ArrowRight'); await p2.keyboard.press('ArrowRight'); await p2.keyboard.press('ArrowRight'); await p2.keyboard.press('ArrowRight');
  await p2.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1580, height: 900 } });
  console.log('screenshot', resolve(shot));
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
