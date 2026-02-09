// config.mjs — load sterile config templates (and later: live overrides)

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const ROOT = path.resolve(process.cwd());

function readYaml(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  return yaml.load(txt);
}

function liveOverridePath(rel) {
  // Live overrides (REAL IDs) live outside the repo and must not be committed.
  // Default location is in the OpenClaw workspace.
  const base = process.env.POOPSY_CORE_LIVE_DIR || '/data/.openclaw/workspace/poopsy-core-live';
  return path.join(base, rel);
}

export function loadConnections() {
  const live = liveOverridePath('connections.yaml');
  if (fs.existsSync(live)) return readYaml(live);
  return readYaml(path.join(ROOT, 'config', 'connections.yaml'));
}

export function loadHousehold() {
  const live = liveOverridePath('household.yaml');
  if (fs.existsSync(live)) return readYaml(live);
  return readYaml(path.join(ROOT, 'config', 'household.yaml'));
}

export function assertConfigured(value, label = 'value') {
  if (!value || value === '__PENDING__' || String(value).includes('PLACEHOLDER')) {
    throw new Error(`${label} is not configured (still placeholder)`);
  }
}
