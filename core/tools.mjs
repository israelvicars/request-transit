// core/tools.mjs: the browser and ffmpeg that core/setup.mjs chose, recorded in .transit-cache/setup.json.
// Every script launches Chromium and runs ffmpeg through here, so a reused system Chrome or a reused
// Playwright cache from another project is used the same way everywhere.
//   TRANSIT_BROWSER=/path/to/chrome | chrome | msedge | bundled   overrides the recorded choice
// Determinism: two renders on the same machine with the same browser build are byte-identical. Different
// browsers or builds (system Chrome vs Playwright's headless shell, or another version) can rasterize text
// slightly differently, so hashes are only comparable per machine+browser.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MARKER = join(ROOT, '.transit-cache', 'setup.json');
const marker = () => { try { return JSON.parse(readFileSync(MARKER, 'utf8')); } catch { return {}; } };

// {kind:'bundled'} | {kind:'channel', value:'chrome'} | {kind:'executable', value:'/path'}
export function browserChoice() {
  const env = process.env.TRANSIT_BROWSER;
  if (env) return env === 'bundled' ? { kind: 'bundled' } : /^(chrome|chrome-beta|msedge|msedge-beta|chromium)$/.test(env) ? { kind: 'channel', value: env } : { kind: 'executable', value: env };
  return marker().browser || { kind: 'bundled' };
}
export const launchOptions = (c = browserChoice()) => c.kind === 'channel' ? { channel: c.value } : c.kind === 'executable' ? { executablePath: c.value } : {};

export async function launchBrowser(opts = {}) {
  const { chromium } = await import('playwright-core');
  return chromium.launch({ ...launchOptions(), ...opts });
}

export const ffmpegBin = () => marker().ffmpeg?.ffmpeg || 'ffmpeg';
export const ffprobeBin = () => marker().ffmpeg?.ffprobe || 'ffprobe';
