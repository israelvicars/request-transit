// scripts/setup.mjs: first-run check and install, shared by every entry script.
//   node >= 18 (required, cannot be auto-installed)
//   npm deps (playwright)       -> `npm install` if missing, no prompt
//   Playwright Chromium         -> `npx playwright install chromium` if it cannot launch, no prompt
//   ffmpeg (render/verify only) -> `brew install ffmpeg` on macOS when Homebrew exists, else a clear message
// A marker in .transit-cache/setup.json makes later runs skip the slow checks. It is invalidated when the
// Node or Playwright version changes, or when the needed parts were not checked yet. Delete it to re-check.
// usage: node scripts/setup.mjs [--force]      (scripts call ensureSetup() themselves)
// env:   TRANSIT_SKIP_SETUP=1 skips everything (CI images that are already prepared)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = join(ROOT, '.transit-cache', 'setup.json');
const MIN_NODE = 18;
const log = (m) => process.stderr.write(`transit setup: ${m}\n`);
const has = (cmd, args = ['-version']) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const run = (cmd, args) => { log(`running: ${cmd} ${args.join(' ')}`); execFileSync(cmd, args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] }); };
const pwVersion = () => { try { return JSON.parse(readFileSync(join(ROOT, 'node_modules/playwright/package.json'), 'utf8')).version; } catch { return null; } };

export async function ensureSetup({ need = ['deps', 'browser', 'ffmpeg'], force = false } = {}) {
  if (process.env.TRANSIT_SKIP_SETUP === '1') return;
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE) { log(`Node ${process.versions.node} is too old; Transit needs Node ${MIN_NODE}+ (https://nodejs.org or \`brew install node\`).`); process.exit(1); }
  let mark = null;
  try { mark = JSON.parse(readFileSync(MARKER, 'utf8')); } catch {}
  const fresh = !force && mark && mark.node === process.versions.node && mark.playwright === pwVersion() && existsSync(join(ROOT, 'node_modules/playwright'));
  const todo = need.filter((n) => !(fresh && mark.ok && mark.ok.includes(n)));
  if (!todo.length) return;
  log(`first run (or changed setup): checking ${todo.join(', ')}`);
  const ok = new Set(fresh ? mark.ok : []);

  if (todo.includes('deps') || todo.includes('browser')) {
    if (!existsSync(join(ROOT, 'node_modules/playwright'))) run('npm', ['install', '--no-audit', '--no-fund']);
    ok.add('deps');
  }
  if (todo.includes('browser')) {
    if (!(await canLaunch())) {
      run('npx', ['playwright', 'install', 'chromium']);
      if (!(await canLaunch())) { log('Playwright Chromium still will not start. On Linux try `npx playwright install --with-deps chromium`.'); process.exit(1); }
    }
    ok.add('browser');
  }
  if (todo.includes('ffmpeg')) {
    if (!has('ffmpeg') || !has('ffprobe')) {
      if (process.platform === 'darwin' && has('brew', ['--version'])) run('brew', ['install', 'ffmpeg']);
      if (!has('ffmpeg') || !has('ffprobe')) {
        log('ffmpeg is needed for MP4/GIF output and was not found.\n' +
          (process.platform === 'darwin' ? '  install Homebrew (https://brew.sh), then: brew install ffmpeg\n'
            : process.platform === 'linux' ? '  Debian/Ubuntu: sudo apt-get install -y ffmpeg   Fedora: sudo dnf install ffmpeg\n'
            : '  Windows: winget install Gyan.FFmpeg   (or https://ffmpeg.org/download.html)\n') +
          '  The interactive HTML (engine/build.mjs) works without it.');
        process.exit(1);
      }
    }
    ok.add('ffmpeg');
  }
  mkdirSync(dirname(MARKER), { recursive: true });
  writeFileSync(MARKER, JSON.stringify({ node: process.versions.node, playwright: pwVersion(), ok: [...ok].sort(), platform: process.platform }, null, 1) + '\n');
  log('ok, recorded in .transit-cache/setup.json');
}

async function canLaunch() {
  try {
    const { chromium } = await import(pathToFileURL(join(ROOT, 'node_modules/playwright/index.mjs')).href);
    const b = await chromium.launch(); await b.close(); return true;
  } catch { return false; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--force')) rmSync(MARKER, { force: true });
  await ensureSetup({ force: process.argv.includes('--force') });
  log('all set');
}
