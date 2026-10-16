import { normalize as normalizeRequest, detectFormat as detectRequestFormat } from '../skills/request-transit/adapters/normalize.mjs';
import { isGitHubActionsRun, normalizeGh } from '../skills/ci-transit/adapters/normalize-gh.mjs';

const adapters = new Map([['gh-actions', normalizeGh]]);
export function registerAdapter(format, adapter) { adapters.set(format, adapter); }
export function pickAdapter(doc, format) {
  if (format === 'gh-actions' || isGitHubActionsRun(doc)) return { format: 'gh-actions', normalize: adapters.get('gh-actions') };
  return { format: format || detectRequestFormat(doc), normalize: format && adapters.get(format) || normalizeRequest };
}
