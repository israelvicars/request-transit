// Generate the committed, self-contained install surface in skills/.
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'skills');
const names = readdirSync(SRC, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(SRC, entry.name, 'SKILL.md')))
  .map((entry) => entry.name)
  .sort();
const packageVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies['playwright-core'];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function addFile(files, outRoot, source, output) {
  files.set(relative(outRoot, output), readFileSync(source));
}

function addTree(files, outRoot, sourceRoot, outputRoot, filter = () => true) {
  if (!existsSync(sourceRoot)) return;
  for (const source of walk(sourceRoot)) {
    if (filter(source)) addFile(files, outRoot, source, join(outputRoot, relative(sourceRoot, source)));
  }
}

function skillText(name) {
  const source = readFileSync(join(SRC, name, 'SKILL.md'), 'utf8');
  const end = source.indexOf('\n---', 3);
  if (end < 0) throw new Error(`missing SKILL.md frontmatter terminator: src/${name}/SKILL.md`);
  const rewritten = source
    .replaceAll(`<skill>/../../core`, '<skill>/core')
    .replaceAll('<skill>/scripts', `<skill>/src/${name}/scripts`)
    .replaceAll('<skill>/samples', `<skill>/src/${name}/samples`)
    .replaceAll('<skill>/references', `<skill>/src/${name}/references`)
    .replaceAll('<skill>/examples', `<skill>/src/${name}/examples`);
  return rewritten.slice(0, end + 4) +
    `\n<!-- Generated from src/${name}/SKILL.md; do not edit -->\n` +
    rewritten.slice(end + 4);
}

function expected(name) {
  const outRoot = join(OUT, name);
  const files = new Map();
  const source = join(SRC, name);
  const core = join(outRoot, 'core');
  const skill = join(outRoot, 'src', name);

  addTree(files, outRoot, join(ROOT, 'core'), core, (file) => !/^test-.*\.mjs$/.test(file.split('/').pop()));
  files.set('SKILL.md', Buffer.from(skillText(name)));
  files.set('package.json', Buffer.from(JSON.stringify({
    name, private: true, type: 'module', dependencies: { 'playwright-core': packageVersion }
  }, null, 2) + '\n'));
  addFile(files, outRoot, join(ROOT, 'LICENSE'), join(outRoot, 'LICENSE'));

  for (const other of names) {
    addTree(files, outRoot, join(SRC, other, 'adapters'), join(outRoot, 'src', other, 'adapters'),
      (file) => !/^test-.*\.mjs$/.test(file.split('/').pop()));
  }
  addTree(files, outRoot, join(SRC, 'request-transit', 'contracts'), join(outRoot, 'src', 'request-transit', 'contracts'),
    (file) => !/^test-.*\.mjs$/.test(file.split('/').pop()));
  addTree(files, outRoot, join(source, 'scripts'), join(skill, 'scripts'),
    (file) => !/^test-.*\.mjs$/.test(file.split('/').pop()));
  addTree(files, outRoot, join(source, 'samples'), join(skill, 'samples'));
  addTree(files, outRoot, join(source, 'references'), join(skill, 'references'),
    (file) => file !== join(source, 'references', 'design-system.md'));
  if (name === 'request-transit') addTree(files, outRoot, join(source, 'examples'), join(skill, 'examples'));
  return files;
}

function actual(root) {
  if (!existsSync(root)) return new Map();
  return new Map(walk(root).map((file) => [relative(root, file), readFileSync(file)]));
}

function same(a, b) {
  if (a.size !== b.size) return false;
  for (const [path, bytes] of a) {
    const other = b.get(path);
    if (!other || !bytes.equals(other)) return false;
  }
  return true;
}

const check = process.argv.includes('--check');
let stale = false;
for (const name of names) {
  const root = join(OUT, name);
  const files = expected(name);
  if (check) {
    if (!same(files, actual(root))) {
      console.error(`generated skill is stale: skills/${name}`);
      stale = true;
    }
    continue;
  }
  rmSync(root, { recursive: true, force: true });
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const output = join(root, path);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, bytes);
  }
  console.log(`wrote skills/${name}`);
}
if (check && stale) {
  console.error('run node scripts/build-skills.mjs');
  process.exit(1);
}
if (check) console.log(`generated skills up to date (${names.length})`);
