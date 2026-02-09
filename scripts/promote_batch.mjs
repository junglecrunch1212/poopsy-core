#!/usr/bin/env node
// promote_batch.mjs — batch-promote all INBOX rows staged as Status=promoted and Moved To blank

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

const MAX = Number(arg('max', process.env.PROMOTE_MAX || 20));

async function main() {
  const ts = nowIso();
  const conn = loadConnections();
  const lifeId = conn?.google_sheets?.life_os?.sheet_id;
  assertConfigured(lifeId, 'google_sheets.life_os.sheet_id');

  const hdrR = gogJson(`sheets get ${lifeId} "INBOX!A2:M2"`);
  if (!hdrR.ok) throw new Error(`INBOX header read failed: ${hdrR.error}`);
  const headers = hdrR.data?.values?.[0] || [];

  const inboxMap = buildHeaderMap(headers, {
    required: ['id', 'status', 'moved_to'],
    aliases: {
      id: ['ID'],
      moved_to: ['Moved To'],
    }
  });
  if (!inboxMap.ok) throw new Error(`INBOX missing required headers: ${inboxMap.missing.join(', ')}`);

  const dataR = gogJson(`sheets get ${lifeId} "INBOX!A3:M"`);
  if (!dataR.ok) throw new Error(`INBOX data read failed: ${dataR.error}`);
  const data = dataR.data?.values || [];

  const candidates = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const status = String(row[inboxMap.idx('status')] || '').toLowerCase();
    const movedTo = String(row[inboxMap.idx('moved_to')] || '').trim();
    const id = String(row[inboxMap.idx('id')] || '').trim();
    if (status === 'promoted' && !movedTo && id.startsWith('INB-')) {
      candidates.push({ rowNum: 3 + i, inboxId: id, title: row[6] || '' });
    }
  }

  const run = { ts, status: 'ok', scanned: data.length, candidates: candidates.length, max: MAX, processed: 0, errors: 0, promoted: [] };

  const { spawnSync } = await import('node:child_process');

  for (const c of candidates.slice(0, MAX)) {
    const r = spawnSync('node', ['scripts/promote_inbox.mjs', `--id=${c.inboxId}`], { encoding: 'utf8' });
    const ok = (r.status ?? 1) === 0;
    if (!ok) {
      run.errors++;
      continue;
    }
    run.processed++;

    try {
      const j = JSON.parse((r.stdout || '').trim());
      run.promoted.push({ inboxId: c.inboxId, itemId: j.itemId || null, title: c.title });
    } catch {
      run.promoted.push({ inboxId: c.inboxId, itemId: null, title: c.title });
    }
  }

  receipt({ intent: 'promote_batch', result: run.errors ? 'ok_with_errors' : 'ok', ok: true, target: 'life_os:_MASTER_LOG', detail: run });
  console.log(JSON.stringify(run, null, 2));
}

main().catch(e => {
  receipt({ intent: 'promote_batch', result: 'error', ok: false, error: e?.message || String(e) });
  console.error(JSON.stringify({ status: 'error', error: e?.message || String(e) }, null, 2));
  process.exit(1);
});
