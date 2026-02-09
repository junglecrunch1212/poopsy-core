#!/usr/bin/env node
// complete_inbox.mjs — v1: mark an INBOX row as done/processed with read-back + receipt

import { append as receipt } from './lib/action_ledger.mjs';
import { gogJson } from './lib/gog.mjs';
import { loadConnections, assertConfigured } from './lib/config.mjs';

function arg(name, def = null) {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length) : def;
}

const inboxId = arg('id');
const status = arg('status', 'done');

if (!inboxId) {
  console.log('Usage: node scripts/complete_inbox.mjs --id=INB-YYYYMMDD-#### [--status=done|processed]');
  process.exit(2);
}

const ts = new Date().toISOString();

try {
  const conn = loadConnections();
  const lifeId = conn?.google_sheets?.life_os?.sheet_id;
  assertConfigured(lifeId, 'google_sheets.life_os.sheet_id');

  // Find row: INBOX headers at row 2, data starts at row 3.
  const colA = gogJson(`sheets get ${lifeId} "INBOX!A3:A"`);
  if (!colA.ok) throw new Error(`read INBOX col A failed: ${colA.error}`);
  const rows = (colA.data?.values || []).map(r => r?.[0] || '');
  const idx = rows.findIndex(v => v === inboxId);
  if (idx < 0) throw new Error(`INBOX id not found: ${inboxId}`);
  const rowNum = 3 + idx;

  // Update Status (D), Moved To (K), Moved On (L)
  const updates = [
    { a1: `INBOX!D${rowNum}:D${rowNum}`, values: [[status]] },
    { a1: `INBOX!K${rowNum}:K${rowNum}`, values: [['poopsy-core']] },
    { a1: `INBOX!L${rowNum}:L${rowNum}`, values: [[ts.replace('T', ' ').slice(0, 16)]] }
  ];

  for (const u of updates) {
    const r = gogJson(`sheets update ${lifeId} "${u.a1}" --values-json '${JSON.stringify(u.values).replace(/'/g, "'\\''")} ' --input USER_ENTERED`);
    if (!r.ok) throw new Error(`update failed ${u.a1}: ${r.error}`);
  }

  // Read-back verify
  const rb = gogJson(`sheets get ${lifeId} "INBOX!A${rowNum}:M${rowNum}"`);
  if (!rb.ok) throw new Error(`read-back failed: ${rb.error}`);
  const rr = rb.data?.values?.[0] || [];
  const ok = rr[0] === inboxId && String(rr[3] || '').toLowerCase() === String(status).toLowerCase();

  receipt({ intent: 'complete_inbox', result: ok ? 'ok_verified' : 'ok_unverified', ok: true, target: 'life_os:INBOX', detail: { inboxId, rowNum, status, verified: ok } });

  console.log(JSON.stringify({ status: 'ok', inboxId, rowNum, setStatus: status, verified: ok }, null, 2));
  process.exit(0);
} catch (e) {
  receipt({ intent: 'complete_inbox', result: 'error', ok: false, error: e?.message || String(e), detail: { inboxId } });
  console.log(JSON.stringify({ status: 'error', inboxId, error: e?.message || String(e) }, null, 2));
  process.exit(1);
}
