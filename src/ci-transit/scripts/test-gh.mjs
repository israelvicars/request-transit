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
const steps = trace.spans.filter((s) => s.attrs['ci.step.number'] != null);
assert.equal(steps.length, 7);
assert.ok(steps.every((s) => s.service === s.spanId), 'each step has a unique station service');
const failedStep = steps.find((s) => s.attrs['ci.job'] === 'test (node 22)' && s.name === 'Run unit tests');
assert.equal(failedStep.status, 'error');
assert.equal(failedStep.statusMessage, 'step failed: Run unit tests');
assert.equal(trace.spans.filter((s) => s.status === 'error' && s.attrs['ci.step.number'] != null).length, 1, 'the failed marker belongs to the failed step');
assert.equal(failedStep.parentId, 'job-240103-step-1', 'steps are stations in their job-local chain');
assert.equal(steps.find((s) => s.attrs['ci.job'] === 'test (node 22)' && s.attrs['ci.step.number'] === 1).parentId, 'job-240103');
const skipped = trace.spans.find((s) => s.name === 'deploy-preview');
assert.equal(skipped.attrs['ci.conclusion'], 'skipped');
assert.equal(skipped.duration, 0);
assert.deepEqual(trace.meta.warnings, []);

const out = '/private/tmp/transit-ci-test.html';
build(new URL('../samples/gh-run-sample.json', import.meta.url), { out });
const html = readFileSync(out, 'utf8');
for (const word of ['job', 'step', 'SERVICE ALERT', 'DELAY', 'Steps', 'ciStepsAsStations', 'data-ci-step']) assert.match(html, new RegExp(word));
assert.match(html, /s\.attrs\['ci\.step\.number'\]/, 'CI markers are filtered to step stations');
console.log('ci: synthetic GitHub Actions normalization and CI vocab pass');
