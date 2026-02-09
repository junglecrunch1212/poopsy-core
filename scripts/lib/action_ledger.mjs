// action_ledger.mjs — append-only action/receipt ledger
// Repo-local runtime state; gitignored.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const LEDGER_PATH = process.env.ACTION_LEDGER_PATH
  ? path.resolve(process.env.ACTION_LEDGER_PATH)
  : path.join(ROOT, 'data', 'ledger', 'action-ledger.jsonl');

function nowIso() {
  return new Date().toISOString();
}

export function append(entry) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  const e = { ts: nowIso(), ...entry };
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(e) + '\n', 'utf8');
  return { ok: true, path: LEDGER_PATH };
}

export function pathInfo() {
  return { path: LEDGER_PATH };
}
