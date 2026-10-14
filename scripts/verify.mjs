// scripts/verify.mjs: done-check for story 4 (share a flow).
//   1. determinism: render every frame twice into separate folders, sha256 each PNG, compare
//   2. timing: each train leaves on frame ceil((intro + span.start / msPerSec) * fps)
//   3. ffmpeg gates on anim.mp4: freezedetect (no static stretch longer than intro/outro allow),
//      blackdetect (no black gaps) and blackdetect on the negated film (no blank white gaps)
// usage: node scripts/verify.mjs <trace.json> --name otel [build options]
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureSetup } from './setup.mjs';
import { ffmpegBin, ffprobeBin } from '../engine/tools.mjs';
await ensureSetup({ need: ['deps', 'browser', 'ffmpeg'] });
const { launchBrowser } = await import('../engine/tools.mjs');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2); const opt = {}; const pos = [];
for (let i = 0; i < argv.length; i++) argv[i].startsWith('--') ? (opt[argv[i].slice(2)] = argv[++i]) : pos.push(argv[i]);
const name = opt.name || 'otel';
const dir = join(ROOT, 'out', name);
let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };
const pass = (args) => { const a = [...args]; for (const [k, v] of Object.entries(opt)) if (k !== 'name') a.push('--' + k, v); return a; };

// 1. two independent full renders
const runA = join(dir, 'frames'), runB = join(dir, 'frames-rerun');
execFileSync('node', pass(['scripts/render.mjs', pos[0], '--name', name]), { cwd: ROOT, stdio: 'ignore' });
execFileSync('node', pass(['scripts/render.mjs', pos[0], '--name', name, '--frames', runB, '--frames-only', '1']), { cwd: ROOT, stdio: 'ignore' });
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const A = readdirSync(runA).filter((f) => f.endsWith('.png')).sort(), B = readdirSync(runB).filter((f) => f.endsWith('.png')).sort();
const diff = A.filter((f, i) => B[i] !== f || sha(join(runA, f)) !== sha(join(runB, f)));
const all = createHash('sha256'); for (const f of A) all.update(sha(join(runA, f)));
ok(A.length === B.length && diff.length === 0, `determinism: ${A.length} frames x 2 renders, sha256 identical (${diff.length} differ); film hash ${all.digest('hex').slice(0, 16)}`);
rmSync(runB, { recursive: true, force: true });

// 2. timing from the page model
const browser = await launchBrowser(); const page = await browser.newPage();
await page.goto(pathToFileURL(join(dir, 'transit.html')).href + '?paused=1');
const V = await page.evaluate(() => ({ ...window.VIZ, trainsAt: undefined, frameOfTraceMs: undefined }));
let bad = 0;
for (const c of V.calls) {
  const f = await page.evaluate((ms) => window.VIZ.frameOfTraceMs(ms), c.start);
  const on = async (fr) => (await page.evaluate((t) => window.VIZ.trainsAt(t), fr / V.fps)).some((x) => x.spanId === c.spanId && !x.back);
  if (!(await on(f)) || (f > 0 && await on(f - 1))) bad++;
}
ok(bad === 0, `timing: ${V.calls.length} trains each leave on the frame of their span start (${bad} off)`);
await browser.close();

// 3. ffmpeg gates
const mp4 = join(dir, 'anim.mp4');
const ff = (vf) => { try { return execFileSync(ffmpegBin(), ['-hide_banner', '-i', mp4, '-vf', vf, '-an', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString(); } catch (e) { return String(e.stderr); } };
const ffe = (vf) => { const r = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${mp4}" -vf "${vf}" -an -f null - 2>&1`]).toString(); return r; };
const maxStill = V.intro + 1.75 + 0.6;
const fz = ffe('freezedetect=n=0.0005:d=' + maxStill.toFixed(2));
const freezes = [...fz.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
ok(freezes.length === 0, `freezedetect: no static stretch >= ${maxStill.toFixed(2)} s (${freezes.length ? freezes.join(', ') + ' s' : 'none'})`);
const bl = ffe('blackdetect=d=0.1:pix_th=0.10');
ok(!/black_start/.test(bl), 'blackdetect: no black gaps');
const wh = ffe('negate,blackdetect=d=0.1:pix_th=0.10:pic_th=0.97');
ok(!/black_start/.test(wh), 'blackdetect (negated): no blank white gaps');
console.log(fail ? `${fail} check(s) failed` : 'all checks passed');
process.exit(fail ? 1 : 0);
