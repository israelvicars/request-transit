import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from '../../../core/build.mjs';
import { normalizeGh } from '../adapters/normalize-gh.mjs';

const sample = readFileSync(new URL('../samples/gh-run-sample.json', import.meta.url), 'utf8');
const trace = normalizeGh(sample);
assert.equal(trace.meta.format, 'gh-actions');
assert.equal(trace.meta.synthetic, true);
assert.equal(trace.spans.length, 13); // root + 5 jobs + 7 timed steps
assert.equal(trace.spans.filter((s) => s.parentId === trace.spans[0].spanId).length, 5);
assert.equal(trace.spans.find((s) => s.name === 'Run unit tests' && s.service === 'test (node 22)').status, 'error');
assert.equal(trace.spans.find((s) => s.name === 'Run unit tests' && s.service === 'test (node 22)').statusMessage, 'step failed: Run unit tests');
const skipped = trace.spans.find((s) => s.name === 'deploy-preview');
assert.equal(skipped.attrs['ci.conclusion'], 'skipped');
assert.equal(skipped.duration, 0);
assert.deepEqual(trace.meta.warnings, []);

const out = '/private/tmp/transit-ci-test.html';
build(new URL('../samples/gh-run-sample.json', import.meta.url), { out });
const html = readFileSync(out, 'utf8');
for (const word of ['job', 'step', 'SERVICE ALERT', 'DELAY', 'Steps']) assert.match(html, new RegExp(word));
console.log('ci: synthetic GitHub Actions normalization and CI vocab pass');
