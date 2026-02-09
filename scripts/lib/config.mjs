// config.mjs — load sterile config templates (and later: live overrides)

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const ROOT = path.resolve(process.cwd());

function readYaml(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  return yaml.load(txt);
}

export function loadConnections() {
  return readYaml(path.join(ROOT, 'config', 'connections.yaml'));
}

export function loadHousehold() {
  return readYaml(path.join(ROOT, 'config', 'household.yaml'));
}

export function assertConfigured(value, label = 'value') {
  if (!value || value === '__PENDING__' || String(value).includes('PLACEHOLDER')) {
    throw new Error(`${label} is not configured (still placeholder)`);
  }
}
