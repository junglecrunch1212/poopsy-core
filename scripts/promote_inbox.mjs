#!/usr/bin/env node
// promote_inbox.mjs — v1.1: promote an INBOX row into _MASTER_LOG, then mark INBOX promoted

import { append as receipt } from './lib/action_ledger.mjs';
import { gogJson } from './lib/gog.mjs';
import { loadConnections, assertConfigured } from './lib/config.mjs';
import { appendMasterLogRow, nowLocalMinute } from './lib/lifeos_masterlog.mjs';

function arg(name, def = null) {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length) : def;
}

const inboxId = arg('id');
const defaultOwner = arg('owner', '');

if (!inboxId) {
  console.log('Usage: node scripts/promote_inbox.mjs --id=INB-YYYYMMDD-#### [--owner=<person>]');
  process.exit(2);
}

const ts = new Date().toISOString();

function escJson(values) {
  return JSON.stringify(values).replace(/'/g, "'\\''");
}

try {
  const conn = loadConnections();
  const lifeId = conn?.google_sheets?.life_os?.sheet_id;
  assertConfigured(lifeId, 'google_sheets.life_os.sheet_id');

  // Find INBOX row
  const colA = gogJson(`sheets get ${lifeId} "INBOX!A3:A"`);
  if (!colA.ok) throw new Error(`read INBOX col A failed: ${colA.error}`);
  const rows = (colA.data?.values || []).map(r => r?.[0] || '');
  const idx = rows.findIndex(v => v === inboxId);
  if (idx < 0) throw new Error(`INBOX id not found: ${inboxId}`);
  const rowNum = 3 + idx;

  const rowR = gogJson(`sheets get ${lifeId} "INBOX!A${rowNum}:M${rowNum}"`);
  if (!rowR.ok) throw new Error(`read INBOX row failed: ${rowR.error}`);
  const r = rowR.data?.values?.[0] || [];

  const status = String(r[3] || '').toLowerCase();
  const movedTo = String(r[10] || '').trim();
  if (status === 'promoted' && movedTo.startsWith('ITM-')) {
    receipt({ intent: 'promote_inbox', result: 'exists_skip', ok: true, target: 'life_os:_MASTER_LOG', detail: { inboxId, itemId: movedTo } });
    console.log(JSON.stringify({ status: 'ok', inboxId, itemId: movedTo, skipped: true }, null, 2));
    process.exit(0);
  }

  const from = r[2] || '';
  const taskTitle = r[6] || '';
  const notes = r[7] || '';
  const owner = r[8] || defaultOwner || '';

  if (!String(taskTitle).trim()) throw new Error('INBOX row has empty Task Title (col G)');

  // Append to master log
  const sourceRef = r[4] ? String(r[4]) : '';
  const ml = await appendMasterLogRow({
    title: String(taskTitle).trim(),
    description: String(notes).trim(),
    owner: String(owner).trim(),
    status: 'inbox',
    source_system: 'life_os_inbox',
    source_ref: sourceRef,
    inbox_id: inboxId
  });

  // Update INBOX: Status, Moved To, Moved On
  const movedOn = nowLocalMinute();
  const updates = [
    { a1: `INBOX!D${rowNum}:D${rowNum}`, values: [['promoted']] },
    { a1: `INBOX!K${rowNum}:K${rowNum}`, values: [[ml.itemId]] },
    { a1: `INBOX!L${rowNum}:L${rowNum}`, values: [[movedOn]] }
  ];

  for (const u of updates) {
    const up = gogJson(`sheets update ${lifeId} "${u.a1}" --values-json '${escJson(u.values)}' --input USER_ENTERED`);
    if (!up.ok) throw new Error(`INBOX update failed ${u.a1}: ${up.error}`);
  }

  // Read-back verify
  const rb = gogJson(`sheets get ${lifeId} "INBOX!A${rowNum}:M${rowNum}"`);
  const rbRow = rb.ok ? (rb.data?.values?.[0] || []) : [];
  const verified = rb.ok && rbRow[0] === inboxId && String(rbRow[3] || '').toLowerCase() === 'promoted' && String(rbRow[10] || '') === ml.itemId;

  receipt({
    intent: 'promote_inbox',
    result: verified ? 'ok_verified' : 'ok_unverified',
    ok: true,
    target: 'life_os:_MASTER_LOG',
    detail: { inboxId, itemId: ml.itemId, rowNum, verified }
  });

  console.log(JSON.stringify({ status: 'ok', inboxId, itemId: ml.itemId, verified }, null, 2));
  process.exit(0);
} catch (e) {
  receipt({ intent: 'promote_inbox', result: 'error', ok: false, error: e?.message || String(e), detail: { inboxId } });
  console.log(JSON.stringify({ status: 'error', inboxId, error: e?.message || String(e) }, null, 2));
  process.exit(1);
}
