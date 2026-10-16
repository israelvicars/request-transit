// Playwright checks for the CI-specific interactive hop list.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
await (await import('../../../core/setup.mjs')).ensureSetup({ need: ['deps', 'browser'] });
const { launchBrowser } = await import('../../../core/tools.mjs');

const file = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'out/ci/transit.html';
const shot = resolve('out/ui/ci-hops-1280x800.png');
mkdirSync(resolve('out/ui'), { recursive: true });
let fails = 0;
const ok = (condition, message) => { console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`); if (!condition) fails++; };
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(pathToFileURL(resolve(file)).href);

ok(await page.isVisible('#hops'), '#hops step list is visible');
const rows = page.locator('#hops tr[data-ci-step]');
const jobs = await rows.evaluateAll((els) => els.map((el) => el.children[1].textContent.trim()));
const expected = ['lint', 'lint', 'test (node 20)', 'test (node 20)', 'test (node 22)', 'test (node 22)', 'build'];
ok(jobs.length === expected.length, `${jobs.length} CI step rows`);
ok(jobs.every((job, i) => job === expected[i]), `rows are grouped by job in order: ${jobs.join(' → ')}`);
ok(await rows.evaluateAll((els) => els.every((el) => el.dataset.ciStep)), 'each row carries data-ci-step');
const needsTransfers = await page.evaluate(() => (window.VIZ.ciExtraTransfers || []).filter((c) => c.from.endsWith('-step-2') && c.to === 'build').map((c) => `${c.from}>${c.to}`));
ok(needsTransfers.length === 2, `build has two extra needs transfers: ${needsTransfers.join(', ')}`);
ok(needsTransfers.includes('job-240101-step-2>build') && needsTransfers.includes('job-240102-step-2>build'), 'extra transfers come from lint and test (node 20)');

const box = await page.evaluate(() => { const el = document.getElementById('hops'); const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: el.clientHeight, scrollHeight: el.scrollHeight }; });
ok(box.bottom <= 800 + 1 && box.height >= 120, `hop list fits in the 1280x800 viewport (${box.height}px)`);
ok(box.scrollHeight > box.height, `hop list overflows (${box.scrollHeight} > ${box.height})`);
await page.mouse.move(640, box.top + 30);
await page.mouse.wheel(0, 800);
await page.waitForTimeout(150);
ok(await page.locator('#hops').evaluate((el) => el.scrollTop > 0), 'hop list scrolls with the wheel');
await page.screenshot({ path: shot });
console.log(`screenshot ${shot}`);
await browser.close();
console.log(fails ? `${fails} failure(s)` : 'all CI UI tests pass');
process.exit(fails ? 1 : 0);
