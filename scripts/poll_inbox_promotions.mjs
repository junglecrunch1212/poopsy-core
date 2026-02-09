#!/usr/bin/env node
// poll_inbox_promotions.mjs
// Scan Life OS INBOX for rows where Status == "promoted" but Moved To is blank,
// then auto-promote them into _MASTER_LOG.
//
// Safety:
// - caps promotions per run
// - idempotent: skips if Moved To already has ITM-
// - receipts emitted per row

import { append as receipt } from './lib/action_ledger.mjs';
import { gogJson } from './lib/gog.mjs';
import { loadConnections, assertConfigured } from './lib/config.mjs';
import { buildHeaderMap } from './lib/header_map.mjs';

function nowIso() { return new Date().toISOString(); }

function arg(name, def = null) {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length) : def;
}

const MAX = Number(arg('max', process.env.PROMOTE_MAX || 10));

function escJson(values) {
  return JSON.stringify(values).replace(/'/g, "'\\''");
}

async function promoteOne({ lifeId, rowNum, row, inboxMap }) {
  const inboxId = row[inboxMap.idx('id')];
  const status = String(row[inboxMap.idx('status')] || '').toLowerCase();
  const movedTo = String(row[inboxMap.idx('moved_to')] || '').trim();
  const movedOnIdx = inboxMap.idx('moved_on');

  if (!inboxId || !String(inboxId).startsWith('INB-')) {
    receipt({ intent: 'poll_promote', result: 'skip_bad_id', ok: true, target: 'life_os:INBOX', detail: { rowNum, inboxId: inboxId || null } });
    return { ok: true, skipped: true, reason: 'bad_id' };
  }

  if (status !== 'promoted') return { ok: true, skipped: true, reason: 'status_not_promoted' };
  if (movedTo && movedTo.startsWith('ITM-')) {
    receipt({ intent: 'poll_promote', result: 'exists_skip', ok: true, target: 'life_os:_MASTER_LOG', detail: { inboxId, itemId: movedTo, rowNum } });
    return { ok: true, skipped: true, reason: 'already_promoted' };
  }

  // Call promote script (keeps masterlog mapping centralized)
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', ['scripts/promote_inbox.mjs', `--id=${inboxId}`], { encoding: 'utf8' });
  const ok = (r.status ?? 1) === 0;

  if (!ok) {
    receipt({ intent: 'poll_promote', result: 'promote_error', ok: false, target: 'life_os:_MASTER_LOG', detail: { inboxId, rowNum, stderr: (r.stderr || '').slice(-600) } });
    return { ok: false, inboxId, error: (r.stdout || r.stderr || '').slice(-800) };
  }

  // Best-effort: ensure Moved On is filled (promote_inbox sets it, but keep resilient)
  if (movedOnIdx >= 0) {
    const movedOn = row[movedOnIdx];
    if (!String(movedOn || '').trim()) {
      await gogJson(`sheets update ${lifeId} \"INBOX!L${rowNum}:L${rowNum}\" --values-json '${escJson([[nowIso().replace('T', ' ').slice(0,16)]])}' --input USER_ENTERED`);
    }
  }

  receipt({ intent: 'poll_promote', result: 'promote_ok', ok: true, target: 'life_os:_MASTER_LOG', detail: { inboxId, rowNum } });
  return { ok: true, inboxId, promoted: true };
}

async function main() {
  const ts = nowIso();
  const conn = loadConnections();
  const lifeId = conn?.google_sheets?.life_os?.sheet_id;
  assertConfigured(lifeId, 'google_sheets.life_os.sheet_id');

  // Header row is row 2
  const hdrR = gogJson(`sheets get ${lifeId} \"INBOX!A2:M2\"`);
  if (!hdrR.ok) throw new Error(`INBOX header read failed: ${hdrR.error}`);
  const headers = hdrR.data?.values?.[0] || [];

  const inboxMap = buildHeaderMap(headers, {
    required: ['id', 'status', 'moved_to'],
    aliases: {
      id: ['ID'],
      moved_to: ['Moved To', 'movedto'],
      moved_on: ['Moved On', 'movedon']
    }
  });
  if (!inboxMap.ok) throw new Error(`INBOX missing required headers: ${inboxMap.missing.join(', ')}`);

  // Read data rows
  const dataR = gogJson(`sheets get ${lifeId} \"INBOX!A3:M\"`);
  if (!dataR.ok) throw new Error(`INBOX data read failed: ${dataR.error}`);
  const data = dataR.data?.values || [];

  const candidates = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const status = String(row[inboxMap.idx('status')] || '').toLowerCase();
    const movedTo = String(row[inboxMap.idx('moved_to')] || '').trim();
    if (status === 'promoted' && !movedTo) {
      candidates.push({ rowNum: 3 + i, row });
    }
  }

  const run = { ts, status: 'ok', scanned: data.length, candidates: candidates.length, max: MAX, processed: 0, errors: 0 };

  for (const c of candidates.slice(0, MAX)) {
    const res = await promoteOne({ lifeId, rowNum: c.rowNum, row: c.row, inboxMap });
    if (res.promoted) run.processed++;
    if (res.ok === false) run.errors++;
  }

  receipt({ intent: 'poll_inbox_promotions', result: 'ok', ok: true, target: 'life_os:INBOX', detail: run });
  console.log(JSON.stringify(run, null, 2));
}

main().catch(e => {
  receipt({ intent: 'poll_inbox_promotions', result: 'error', ok: false, error: e?.message || String(e) });
  console.error(JSON.stringify({ status: 'error', error: e?.message || String(e) }, null, 2));
  process.exit(1);
});
