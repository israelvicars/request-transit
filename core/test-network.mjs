// core/test-network.mjs: privacy check. Builds the interactive page (with and without contracts), opens it
// in Chromium, plays it and drives the panel, and fails if the page makes ANY request other than its own
// file:// load or inline data: URLs (no CDN, fonts, analytics, beacons, websockets).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureSetup } from './setup.mjs';
import { build } from './build.mjs';
await ensureSetup({ need: ['deps', 'browser'] });
const { launchBrowser, ROOT } = await import('./tools.mjs');
const dir = join(ROOT, '.transit-cache', 'test-network'); mkdirSync(dir, { recursive: true });
const pages = [build(join(ROOT, 'skills/request-transit/samples/otel-demo-checkout.otlp.json'), { out: join(dir, 'plain.html') }).out,
  build(join(ROOT, 'skills/ci-transit/samples/gh-run-sample.json'), { format: 'gh-actions', out: join(dir, 'ci.html') }).out,
  build(join(ROOT, 'skills/agent-transit/samples/claude-code-synthetic.jsonl'), { format: 'claude-code', out: join(dir, 'agent.html') }).out];
try { pages.push(build(join(ROOT, 'skills/request-transit/samples/otel-demo-checkout.otlp.json'), { out: join(dir, 'contracts.html'), contracts: join(ROOT, '.transit-cache/contracts/index.json') }).out); } catch { /* no index built: plain page only */ }
const browser = await launchBrowser();
let bad = [];
for (const html of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const seen = [];
  ctx.on('request', (r) => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) seen.push(u); });
  ctx.on('websocket', (w) => seen.push('ws ' + w.url()));
  await ctx.route(/^(https?|wss?):/, (route) => { seen.push('routed ' + route.request().url()); route.abort(); });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  await page.waitForTimeout(1500);                      // let it play
  for (const k of ['n', 'n', 'n', '?', 'Escape', '3', 'End', 'Home', 'p']) await page.keyboard.press(k);
  await page.mouse.click(600, 400);
  await page.waitForTimeout(800);
  await page.evaluate(() => document.fonts.ready);
  console.log(`${seen.length ? 'FAIL' : 'ok  '} ${html.split('/').pop()}: ${seen.length} network request(s)${seen.length ? '\n  ' + seen.join('\n  ') : ''}`);
  bad = bad.concat(seen);
  await ctx.close();
}
await browser.close();
if (bad.length) process.exit(1);
console.log('zero network requests from the built page');
