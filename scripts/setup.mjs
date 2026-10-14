// scripts/setup.mjs: first-run check, shared by every entry script. Reuses what the machine already has and
// downloads only what is missing, always with a one-line size notice first.
//   node >= 18            required, never installed
//   npm deps              `npm install` (playwright-core, ~13 MB) only when node_modules is missing
//   browser, first that launches:
//     1. TRANSIT_BROWSER (path, or channel chrome/msedge)
//     2. Playwright's own build for this playwright-core version, if already downloaded
//     3. any other Chromium / headless shell already in the Playwright cache (other projects' downloads)
//     4. system Google Chrome or Microsoft Edge (Playwright channels), or chromium on PATH (Linux)
//     5. download chromium-headless-shell only (~100 MB download / ~200 MB on disk; full Chromium is ~170 MB / ~370 MB)
//   ffmpeg + ffprobe       PATH or Homebrew/usr-local locations; else `brew install ffmpeg` on macOS (notice),
//                          or opt-in TRANSIT_FFMPEG_STATIC=1 / --ffmpeg-static (npm ffmpeg-static + ffprobe-static,
//                          ~80 MB, into node_modules); else instructions
// The marker .transit-cache/setup.json records what was reused vs installed; scripts read it via engine/tools.mjs.
// usage: node scripts/setup.mjs [--force] [--check] [--no-download] [--ffmpeg-static]
//   --check        dry run: report what would be used or downloaded, change nothing (exit 1 if something is missing)
//   --no-download  never download (also TRANSIT_NO_DOWNLOAD=1); fail with instructions instead
// env: TRANSIT_SKIP_SETUP=1 skips everything (prepared CI images); TRANSIT_NO_SYSTEM_BROWSER=1 ignores system
//      Chrome/Edge (pin renders to Playwright's build); TRANSIT_BROWSER=... forces one
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { lookup } from 'node:dns/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, MARKER, launchOptions } from '../engine/tools.mjs';

const MIN_NODE = 18;
const log = (m) => process.stderr.write(`transit setup: ${m}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runs = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const PW = join(ROOT, 'node_modules/playwright-core');
const pwVersion = () => { try { return JSON.parse(readFileSync(join(PW, 'package.json'), 'utf8')).version; } catch { return null; } };
const argv = process.argv.slice(2);
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

class SetupError extends Error {}
const fail = (msg) => { throw new SetupError(msg); };

async function online(host) { try { await lookup(host); return true; } catch { return false; } }
// Retries with backoff (2 s, 8 s) for network steps; returns true on success.
async function runRetry(label, cmd, args, { attempts = 3 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    log(`${label}${attempts > 1 ? ` (attempt ${i}/${attempts})` : ''}: ${cmd} ${args.join(' ')}`);
    const r = spawnSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });
    if (r.status === 0) return true;
    if (i < attempts) await sleep(i === 1 ? 2000 : 8000);
  }
  return false;
}

// ---------------------------------------------------------------- browser
const pwCacheDir = () => process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0' ? process.env.PLAYWRIGHT_BROWSERS_PATH
  : process.platform === 'darwin' ? join(homedir(), 'Library/Caches/ms-playwright')
  : process.platform === 'win32' ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'ms-playwright')
  : join(homedir(), '.cache/ms-playwright');
const EXE = new Set(['chrome-headless-shell', 'chrome-headless-shell.exe', 'Chromium', 'chrome', 'chrome.exe', 'Google Chrome for Testing']);
function findExecutables(dir, depth = 5, out = []) {
  let names; try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    const p = join(dir, n); let st; try { st = statSync(p); } catch { continue; }
    if (st.isFile() && EXE.has(n) && (process.platform === 'win32' || st.mode & 0o111)) out.push(p);
    else if (st.isDirectory() && depth > 0 && !n.endsWith('.framework') && n !== 'Resources' && n !== 'locales') findExecutables(p, depth - 1, out);
  }
  return out;
}
// Other Playwright downloads on this machine, newest revision first, headless shells before full Chromium.
function cachedBrowsers() {
  const base = pwCacheDir(); let dirs = [];
  try { dirs = readdirSync(base).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d)); } catch {}
  dirs.sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()) || (b.includes('headless') ? 1 : -1));
  return dirs.flatMap((d) => findExecutables(join(base, d)).map((p) => ({ kind: 'executable', value: p, source: 'playwright-cache', label: d })));
}
function systemBrowsers() {
  const c = [{ kind: 'channel', value: 'chrome', source: 'system', label: 'Google Chrome' }, { kind: 'channel', value: 'msedge', source: 'system', label: 'Microsoft Edge' }];
  if (process.platform === 'linux') for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']) if (existsSync(p)) c.push({ kind: 'executable', value: p, source: 'system', label: p });
  return c;
}
async function tryLaunch(choice) {
  try {
    const { chromium } = await import(pathToFileURL(join(PW, 'index.mjs')).href);
    const b = await chromium.launch({ ...launchOptions(choice), timeout: 30000 });
    const version = b.version(); await b.close(); return version;
  } catch { return null; }
}
async function pickBrowser({ check, noDownload }) {
  const candidates = [];
  if (process.env.TRANSIT_BROWSER) {
    const v = process.env.TRANSIT_BROWSER;
    candidates.push(v === 'bundled' ? { kind: 'bundled', source: 'env' } : /^(chrome|chrome-beta|msedge|msedge-beta|chromium)$/.test(v) ? { kind: 'channel', value: v, source: 'env' } : { kind: 'executable', value: v, source: 'env' });
  } else {
    candidates.push({ kind: 'bundled', source: 'playwright-cache', label: `playwright-core ${pwVersion()} build` }, ...cachedBrowsers(), ...(process.env.TRANSIT_NO_SYSTEM_BROWSER === '1' ? [] : systemBrowsers()));
  }
  for (const c of candidates) {
    const version = await tryLaunch(c);
    if (version) return { ...c, version };
  }
  if (process.env.TRANSIT_BROWSER) fail(`TRANSIT_BROWSER=${process.env.TRANSIT_BROWSER} did not launch. Point it at a Chrome/Chromium/Edge executable or a channel (chrome, msedge), or unset it.`);
  const notice = 'no usable Chrome/Chromium found; Transit needs chromium-headless-shell (~100 MB download, ~200 MB on disk, into ' + pwCacheDir() + ')';
  if (check) return { kind: 'bundled', source: 'would-download', note: notice };
  if (noDownload) fail(`${notice}, but downloads are disabled (--no-download / TRANSIT_NO_DOWNLOAD).\n  Install Google Chrome, or set TRANSIT_BROWSER=/path/to/chrome, or allow the download.`);
  if (!(await online('cdn.playwright.dev')) && !(await online('playwright.download.prss.microsoft.com'))) fail(`${notice}, but this machine looks offline (DNS lookup failed).\n  Connect and rerun, install Google Chrome, or set TRANSIT_BROWSER=/path/to/chrome.`);
  log(`${notice}. Downloading once…`);
  if (!(await runRetry('browser download', process.execPath, [join(PW, 'cli.js'), 'install', '--only-shell', 'chromium']))) fail('chromium-headless-shell download failed 3 times. Check your network/proxy (HTTPS_PROXY), or install Google Chrome and rerun.');
  const version = await tryLaunch({ kind: 'bundled' });
  if (!version) fail('the downloaded headless shell does not start.' + (process.platform === 'linux' ? ' On Linux install its system libraries: npx playwright-core install-deps chromium' : ''));
  return { kind: 'bundled', source: 'downloaded', label: 'chromium-headless-shell', version };
}

// ---------------------------------------------------------------- ffmpeg
function findFfmpeg() {
  const dirs = ['', '/opt/homebrew/bin/', '/usr/local/bin/', '/usr/bin/'];
  for (const d of dirs) if (runs(d + 'ffmpeg', ['-version']) && runs(d + 'ffprobe', ['-version'])) return { ffmpeg: d + 'ffmpeg', ffprobe: d + 'ffprobe' };
  try {
    const req = (m) => { const mod = JSON.parse(readFileSync(join(ROOT, 'node_modules', m, 'package.json'), 'utf8')); return mod; };
    req('ffmpeg-static'); req('ffprobe-static');
    const ffmpeg = join(ROOT, 'node_modules/ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    const ffprobe = join(ROOT, 'node_modules/ffprobe-static/bin', process.platform, process.arch, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (runs(ffmpeg, ['-version']) && runs(ffprobe, ['-version'])) return { ffmpeg, ffprobe, static: true };
  } catch {}
  return null;
}
async function pickFfmpeg({ check, noDownload, wantStatic }) {
  const found = findFfmpeg();
  if (found) return { source: found.static ? 'ffmpeg-static' : 'system', ffmpeg: found.ffmpeg, ffprobe: found.ffprobe };
  const how = process.platform === 'darwin' ? 'brew install ffmpeg' : process.platform === 'linux' ? 'sudo apt-get install -y ffmpeg  (Fedora: sudo dnf install ffmpeg)' : 'winget install Gyan.FFmpeg';
  const help = `ffmpeg/ffprobe are needed for MP4/GIF output and were not found.\n  Install: ${how}\n  Or opt in to a bundled copy: TRANSIT_FFMPEG_STATIC=1 (npm ffmpeg-static + ffprobe-static, ~80 MB)\n  The interactive HTML (engine/build.mjs) works without ffmpeg.`;
  if (check) return { source: 'missing', note: wantStatic ? 'would install ffmpeg-static + ffprobe-static (~80 MB)' : process.platform === 'darwin' && runs('brew', ['--version']) ? 'would run brew install ffmpeg (~100+ MB with dependencies)' : how };
  if (noDownload) fail(help);
  if (wantStatic || (process.platform === 'darwin' && runs('brew', ['--version']))) {
    if (!(await online('registry.npmjs.org')) && !(await online('formulae.brew.sh'))) fail('ffmpeg is missing and this machine looks offline.\n' + help);
    if (wantStatic) {
      log('installing ffmpeg-static + ffprobe-static (~80 MB, opt-in) into node_modules…');
      if (!(await runRetry('npm', 'npm', ['install', '--no-save', '--no-audit', '--no-fund', 'ffmpeg-static@5', 'ffprobe-static@3']))) fail('npm install of ffmpeg-static failed 3 times.\n' + help);
    } else {
      log('ffmpeg not found; installing it with Homebrew (brew install ffmpeg, ~100+ MB with dependencies)…');
      if (!(await runRetry('brew', 'brew', ['install', 'ffmpeg'], { attempts: 2 }))) fail('brew install ffmpeg failed.\n' + help);
    }
    const f = findFfmpeg();
    if (f) return { source: f.static ? 'ffmpeg-static' : 'installed (brew)', ffmpeg: f.ffmpeg, ffprobe: f.ffprobe };
  }
  fail(help);
}

// ---------------------------------------------------------------- main entry
export async function ensureSetup({ need = ['deps', 'browser', 'ffmpeg'], force = false, check = false } = {}) {
  if (process.env.TRANSIT_SKIP_SETUP === '1') return null;
  const noDownload = argv.includes('--no-download') || process.env.TRANSIT_NO_DOWNLOAD === '1';
  const wantStatic = argv.includes('--ffmpeg-static') || process.env.TRANSIT_FFMPEG_STATIC === '1';
  try {
    const major = Number(process.versions.node.split('.')[0]);
    if (major < MIN_NODE) fail(`Node ${process.versions.node} is too old; Transit needs Node ${MIN_NODE}+ (https://nodejs.org or \`brew install node\`).`);
    let mark = null;
    try { mark = JSON.parse(readFileSync(MARKER, 'utf8')); } catch {}
    const browserGone = mark?.browser?.kind === 'executable' && !existsSync(mark.browser.value);
    const fresh = !force && !check && mark && mark.version === 2 && mark.node === process.versions.node && mark.playwrightCore === pwVersion() && existsSync(PW) && !browserGone;
    const todo = need.filter((n) => !(fresh && mark.ok?.includes(n)));
    if (!todo.length) return mark;
    if (!check) log(`first run (or changed setup): checking ${todo.join(', ')}`);
    const rec = fresh ? { ...mark } : { version: 2, ok: [] };
    const ok = new Set(rec.ok);

    if (todo.includes('deps') || todo.includes('browser')) {
      if (existsSync(PW)) rec.deps = { source: 'present' };
      else if (check) rec.deps = { source: 'missing', note: 'would run npm install (playwright-core, ~13 MB)' };
      else {
        if (noDownload) fail('node_modules is missing and downloads are disabled. Run `npm install` in ' + ROOT);
        if (!(await online('registry.npmjs.org'))) fail('node_modules is missing and this machine looks offline (cannot resolve registry.npmjs.org). Connect and rerun, or copy node_modules from another machine.');
        log('installing npm dependencies (playwright-core, ~13 MB)…');
        if (!(await runRetry('npm install', 'npm', ['install', '--no-audit', '--no-fund', '--omit=dev']))) fail('npm install failed 3 times. Check your network/proxy and run `npm install` in ' + ROOT + ' to see the error.');
        rec.deps = { source: 'installed' };
      }
      ok.add('deps');
    }
    if (todo.includes('browser')) {
      rec.browser = existsSync(PW) ? await pickBrowser({ check, noDownload }) : { source: 'unknown', note: 'needs npm deps first' };
      ok.add('browser');
    }
    if (todo.includes('ffmpeg')) { rec.ffmpeg = await pickFfmpeg({ check, noDownload, wantStatic }); ok.add('ffmpeg'); }

    Object.assign(rec, { node: process.versions.node, playwrightCore: pwVersion(), platform: `${process.platform}-${process.arch}`, ok: [...ok].sort() });
    if (check) return rec;
    mkdirSync(dirname(MARKER), { recursive: true });
    writeFileSync(MARKER, JSON.stringify(rec, null, 1) + '\n');
    const b = rec.browser, f = rec.ffmpeg;
    log(`ok: browser = ${b ? `${b.label || b.value || b.kind} (${b.source}${b.version ? ', ' + b.version : ''})` : 'not needed'}; ffmpeg = ${f ? `${f.ffmpeg} (${f.source})` : 'not needed'}. Recorded in .transit-cache/setup.json`);
    return rec;
  } catch (e) {
    if (!(e instanceof SetupError)) throw e;
    log(e.message); if (isMain || !check) process.exit(1); throw e;
  }
}

if (isMain) {
  const check = argv.includes('--check');
  if (argv.includes('--force')) rmSync(MARKER, { force: true });
  const rec = await ensureSetup({ force: argv.includes('--force'), check });
  if (check) {
    const line = (k, v) => console.log(`${k.padEnd(8)} ${v}`);
    line('node', `${process.versions.node} (needs ${MIN_NODE}+)`);
    line('deps', `${rec.deps?.source}${rec.deps?.note ? ' - ' + rec.deps.note : ''}`);
    const b = rec.browser || {};
    line('browser', b.source === 'would-download' ? `missing - ${b.note}` : `${b.label || b.value || b.kind} [${b.source}]${b.version ? ' ' + b.version : ''}`);
    const f = rec.ffmpeg || {};
    line('ffmpeg', f.ffmpeg ? `${f.ffmpeg} [${f.source}]` : `missing - ${f.note}`);
    const missing = rec.deps?.source === 'missing' || b.source === 'would-download' || !f.ffmpeg;
    console.log(missing ? 'check: something would be installed (nothing was changed)' : 'check: everything present, nothing to download');
    process.exit(missing ? 1 : 0);
  }
  log('all set');
}
