#!/usr/bin/env node
// probe_action_ledger.mjs
// Validates the action ledger is present/writable, parseable JSONL, and does not contain obvious secrets.
// Prints PROBE_OK / PROBE_FAIL and a small JSON report.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const LEDGER_PATH = process.env.ACTION_LEDGER_PATH
  ? path.resolve(process.env.ACTION_LEDGER_PATH)
  : path.join(ROOT, 'data', 'ledger', 'action-ledger.jsonl');

const MAX_LINES = Number(process.env.PROBE_LEDGER_MAX_LINES || 200);

const SECRET_PATTERNS = [
  /(Authorization:)/i,
  /(Bearer\s+[A-Za-z0-9._-]{12,})/,
  /(api[_-]?key)/i,
  /(xox[baprs]-[A-Za-z0-9-]+)/,
  /(ghp_[A-Za-z0-9]{20,})/,
  /(AIza[0-9A-Za-z_-]{30,})/
];

function nowIso() {
  return new Date().toISOString();
}

function fail(report, reason) {
  report.ok = false;
  report.reason = reason;
  console.log('PROBE_FAIL');
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

function ok(report) {
  report.ok = true;
  console.log('PROBE_OK');
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const report = {
  ts: nowIso(),
  probe: 'action_ledger',
  path: LEDGER_PATH,
  exists: false,
  writable: false,
  linesChecked: 0,
  parseErrors: 0,
  missingFieldsCount: 0,
  secretHits: 0
};

try {
  // Ensure directory exists
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });

  report.exists = fs.existsSync(LEDGER_PATH);

  // Ensure file exists (touch)
  if (!report.exists) {
    fs.writeFileSync(LEDGER_PATH, '');
    report.exists = true;
  }

  // Writability test (append + remove)
  const marker = { ts: nowIso(), intent: '__probe__', result: '__probe__' };
  const markerLine = JSON.stringify(marker) + '\n';
  fs.appendFileSync(LEDGER_PATH, markerLine, 'utf8');
  report.writable = true;

  // Read last N lines and validate
  const content = fs.readFileSync(LEDGER_PATH, 'utf8');
  const lines = content.split(/\r?\n/).filter(Boolean);
  const tail = lines.slice(-MAX_LINES);
  report.linesChecked = tail.length;

  for (const line of tail) {
    for (const re of SECRET_PATTERNS) {
      if (re.test(line)) report.secretHits++;
    }

    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      report.parseErrors++;
      continue;
    }

    // Minimal expected fields when entries exist
    if (obj && typeof obj === 'object') {
      if (!('ts' in obj) || !('intent' in obj) || !('result' in obj)) {
        report.missingFieldsCount++;
      }
    }
  }

  // Remove probe marker line by rewriting without it (best-effort)
  const cleaned = lines.filter(l => {
    try {
      const o = JSON.parse(l);
      return !(o && o.intent === '__probe__' && o.result === '__probe__');
    } catch {
      return true;
    }
  });
  fs.writeFileSync(LEDGER_PATH, cleaned.length ? cleaned.join('\n') + '\n' : '', 'utf8');

  if (report.secretHits > 0) {
    fail(report, 'secret-like content detected in ledger');
  }

  ok(report);
} catch (e) {
  fail(report, e.message || String(e));
}
