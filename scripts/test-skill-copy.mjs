import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(new URL('..', import.meta.url).pathname);
const cases = [
  ['request-transit', 'samples/otel-demo-checkout.otlp.json'],
  ['ci-transit', 'samples/gh-run-sample.json'],
  ['agent-transit', 'samples/claude-code-synthetic.jsonl']
];

for (const [name, sample] of cases) {
  const temp = mkdtempSync(join(tmpdir(), `transit-${name}-`));
  try {
    const skill = temp;
    cpSync(join(root, 'skills', name), skill, { recursive: true });
    const out = join(temp, 'out.html');
    const args = [join(skill, 'core', 'build.mjs'), join(skill, 'src', name, sample), '--out', out];
    if (name === 'ci-transit') args.splice(2, 0, '--format', 'gh-actions');
    if (name === 'agent-transit') args.splice(2, 0, '--format', 'claude-code');
    execFileSync(process.execPath, args, { cwd: temp, stdio: 'inherit' });
    assert.ok(readFileSync(out, 'utf8').includes('<!doctype html>'));
    console.log(`isolated copy passed: ${name}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
