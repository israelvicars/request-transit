// scripts/render.mjs: trace file -> out/<name>/{transit.html, frames/, anim.mp4, anim.gif, contact.png}
// Frame-exact: the page's rAF loop is frozen and every frame is renderAt(i / fps).
// usage: node scripts/render.mjs <trace.json> [--name NAME] [build options...]
import { execFileSync } from 'node:child_process';
import { ensureSetup } from './setup.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { build } from '../engine/build.mjs';
await ensureSetup({ need: ['deps', 'browser', 'ffmpeg'] });
const { chromium } = await import('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2); const opt = {}; const pos = [];
for (let i = 0; i < argv.length; i++) argv[i].startsWith('--') ? (opt[argv[i].slice(2)] = argv[++i]) : pos.push(argv[i]);
if (!pos[0]) { console.error('usage: node scripts/render.mjs <trace.json> [--name NAME]'); process.exit(1); }
const name = opt.name || 'trace';
const dir = resolve(opt['out-dir'] || join(ROOT, 'out', name));
const frames = opt.frames || join(dir, 'frames');
const { out: html } = build(resolve(pos[0]), { ...opt, out: join(dir, 'transit.html') });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href + '?paused=1');
const { seconds, fps, msPerSec } = await page.evaluate(() => window.VIZ);
await browser.close();
console.log(`${name}: ${seconds.toFixed(3)} s at ${fps} fps, 1 s of video = ${msPerSec} ms of trace`);
const run = (args) => execFileSync('node', args, { cwd: ROOT, stdio: 'inherit' });
run(['engine/render-frames.mjs', html, String(seconds), String(fps), '--out', frames]);
if (opt['frames-only']) process.exit(0);
for (const k of ['mp4', 'gif', 'sheet']) run(['engine/export.mjs', k, '--fps', String(fps), '--frames', frames, '--out', dir]);
