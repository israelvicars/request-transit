import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const runId = argv.shift();
if (!runId || runId.startsWith('-')) throw new Error('usage: node skills/ci-transit/scripts/fetch.mjs <run-id> [--repo owner/name] [--out run.json]');
let repo, out = 'run.json';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--repo') repo = argv[++i];
  else if (argv[i] === '--out') out = argv[++i];
  else throw new Error(`unknown option: ${argv[i]}`);
}
const fields = 'databaseId,name,displayTitle,headBranch,event,status,conclusion,createdAt,startedAt,updatedAt,url,workflowName,attempt,jobs';
const args = ['run', 'view', runId, '--json', fields];
if (repo) args.push('--repo', repo);
try {
  const text = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const run = JSON.parse(text);
  writeFileSync(out, JSON.stringify(run, null, 2) + '\n');
  console.log(`wrote ${out} (${run.jobs?.length || 0} jobs)`);
} catch (error) {
  const detail = String(error.stderr || error.message || '').trim();
  if (error.code === 'ENOENT') throw new Error('GitHub Actions fetch requires the `gh` CLI, but it was not found on PATH. Install gh and retry.');
  if (/auth|login|token|not logged/i.test(detail)) throw new Error(`GitHub CLI is not authenticated. Run `gh auth login`, then retry.\n${detail}`);
  throw new Error(`gh run view failed for run ${runId}${repo ? ` in ${repo}` : ''}. The command is read-only.\n${detail}`);
}
