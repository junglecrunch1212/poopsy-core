#!/usr/bin/env node
// observe — v1: read-only snapshot of Life OS tasks into state/signals.json

import fs from 'fs';
import path from 'path';
import { append as receipt } from './lib/action_ledger.mjs';
import { loadConnections, assertConfigured } from './lib/config.mjs';
import { gogJson } from './lib/gog.mjs';

const ROOT = path.resolve(process.cwd());
const STATE_DIR = path.join(ROOT, 'state');

function writeJson(relPath, obj) {
  fs.mkdirSync(path.dirname(relPath), { recursive: true });
  fs.writeFileSync(relPath, JSON.stringify(obj, null, 2) + '\n');
}

const out = { status: 'ok', step: 'observe', ts: new Date().toISOString() };

try {
  const conn = loadConnections();
  const lifeId = conn?.google_sheets?.life_os?.sheet_id;
  assertConfigured(lifeId, 'google_sheets.life_os.sheet_id');

  const r = gogJson(`sheets get ${lifeId} "_MASTER_LOG!A1:AT"`);
  if (!r.ok) throw new Error(r.error);

  const rows = r.data?.values || [];
  const headers = rows[0] || [];
  const data = rows.slice(1).filter(x => x && x[0]);

  // naive indices for v1 (we will replace with header_map usage next)
  const IDX = { item_id: 0, title: 2, owner: 6, status: 7, score_now: 30 };

  const active = data.filter(row => ['inbox', 'next', 'scheduled', 'waiting'].includes((row[IDX.status] || '').toLowerCase()));
  const top = active
    .map(row => ({
      id: row[IDX.item_id],
      title: row[IDX.title],
      owner: row[IDX.owner],
      status: row[IDX.status],
      score: Number(row[IDX.score_now] || 0)
    }))
    .sort((a, b) => (b.score - a.score))
    .slice(0, 3);

  const signals = {
    ts: out.ts,
    source: { life_os: lifeId },
    counts: {
      total_rows: data.length,
      active: active.length
    },
    top3: top
  };

  fs.mkdirSync(STATE_DIR, { recursive: true });
  writeJson(path.join(STATE_DIR, 'signals.json'), signals);

  receipt({ intent: 'observe', result: 'ok', ok: true, target: 'life_os:_MASTER_LOG', detail: { active: active.length } });

  console.log(JSON.stringify({ ...out, signalsSummary: { active: active.length, top3: top.map(t => t.title) } }, null, 2));
  process.exit(0);
} catch (e) {
  receipt({ intent: 'observe', result: 'error', ok: false, error: e?.message || String(e) });
  console.log(JSON.stringify({ status: 'error', step: 'observe', error: e?.message || String(e) }, null, 2));
  process.exit(1);
}
