import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from './build.mjs';

const sample = resolve('src/request-transit/samples/otel-demo-checkout.otlp.json');
const dir = mkdtempSync(join(tmpdir(), 'transit-vocab-'));
try {
  const custom = {
    lineNoun: 'TOKEN_LINE', stationNoun: 'TOKEN_STATION', hopNoun: 'TOKEN_HOP', hopNounPlural: 'TOKEN_HOPS',
    serviceAlert: 'TOKEN_ALERT', delay: 'TOKEN_DELAY', tableTitle: 'TOKEN_TABLE', attributes: 'TOKEN_ATTRS',
    expectedRequestResponse: 'TOKEN_CONTRACTS', tableStatus: 'TOKEN_STATUS', infrastructure: 'TOKEN_INFRA',
  };
  const customOut = join(dir, 'custom.html');
  build(sample, { out: customOut, vocab: custom });
  const customHtml = readFileSync(customOut, 'utf8');
  for (const token of Object.values(custom)) assert.match(customHtml, new RegExp(token));

  const defaultOut = join(dir, 'default.html');
  build(sample, { out: defaultOut });
  const defaultHtml = readFileSync(defaultOut, 'utf8');
  for (const label of ['DELAY', 'SERVICE ALERT', 'Hops', 'Attributes', 'Expected request / response', 'infrastructure']) {
    assert.match(defaultHtml, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  console.log('vocab: custom tokens injected and request defaults retained');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
