import { normalize as normalizeRequest, detectFormat as detectRequestFormat } from '../skills/request-transit/adapters/normalize.mjs';
import { isGitHubActionsRun, normalizeGh } from '../skills/ci-transit/adapters/normalize-gh.mjs';
import { isAgentLog, normalizeAgent } from '../skills/agent-transit/adapters/normalize-agent.mjs';

const adapters = new Map([['gh-actions', normalizeGh], ['claude-code', normalizeAgent], ['codex', normalizeAgent], ['cursor', normalizeAgent]]);
export function registerAdapter(format, adapter) { adapters.set(format, adapter); }
export function pickAdapter(doc, format) {
  if (format === 'gh-actions' || isGitHubActionsRun(doc)) return { format: 'gh-actions', normalize: adapters.get('gh-actions') };
  if (format === 'claude-code' || format === 'codex' || format === 'cursor' || isAgentLog(doc)) {
    const selected = format || (doc && doc[0] && doc[0]._agentFormat) || 'claude-code';
    return { format: selected, normalize: adapters.get(selected) };
  }
  return { format: format || detectRequestFormat(doc), normalize: format && adapters.get(format) || normalizeRequest };
}
