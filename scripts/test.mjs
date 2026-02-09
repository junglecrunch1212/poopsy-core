#!/usr/bin/env node
// Minimal sanity test runner for poopsy-core.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}

console.log('poopsy-core test suite');

const required = [
  'package.json',
  'README.md',
  'SKILL.md',
  'HEARTBEAT.md',
  'hooks/on-message.md',
  'config/connections.yaml',
  'config/household.yaml',
  'scripts/sanitize_check.sh',
  'scripts/observe.mjs',
  'scripts/decide.mjs',
  'scripts/capture.mjs',
  'scripts/setup.mjs',
  'scripts/learn.mjs',
  'scripts/backup.mjs',
  'scripts/lib/header_map.mjs',
  'docs/activation.md'
];

for (const f of required) {
  test(`${f} exists`, () => {
    assert(fs.existsSync(path.join(ROOT, f)), `missing ${f}`);
  });
}

test('package.json parses', () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert(j.name === 'poopsy-core', 'wrong package name');
  assert(j.type === 'module', 'expected type=module');
});

console.log(`RESULT ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
