#!/usr/bin/env node
// probe_life_os_read.mjs — read-only Life OS probe

import { loadConnections, assertConfigured } from './lib/config.mjs';
import { gogJson } from './lib/gog.mjs';
import { buildHeaderMap } from './lib/header_map.mjs';

function outAndExit(ok, report) {
  console.log(ok ? 'PROBE_OK' : 'PROBE_FAIL');
  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
}

const report = {
  ts: new Date().toISOString(),
  probe: 'life_os_read',
  ok: false,
  checks: {}
};

try {
  const conn = loadConnections();
  const lifeId = conn?.google_sheets?.life_os?.sheet_id;
  assertConfigured(lifeId, 'google_sheets.life_os.sheet_id');

  // Master log headers
  const ml = gogJson(`sheets get ${lifeId} "_MASTER_LOG!A1:AT1"`);
  if (!ml.ok) throw new Error(`_MASTER_LOG header read failed: ${ml.error}`);
  const mlHeaders = ml.data?.values?.[0] || [];
  const mlMap = buildHeaderMap(mlHeaders, {
    required: ['item_id', 'title', 'owner', 'status'],
    aliases: {
      item_id: ['id', 'item id'],
    }
  });

  // Inbox headers (row 2 is headers per our docs)
  const ib = gogJson(`sheets get ${lifeId} "INBOX!A2:M2"`);
  if (!ib.ok) throw new Error(`INBOX header read failed: ${ib.error}`);
  const ibHeaders = ib.data?.values?.[0] || [];
  const ibMap = buildHeaderMap(ibHeaders, {
    required: ['id', 'when', 'from', 'status'],
    aliases: {
      id: ['ID'],
      when: ['When', 'timestamp'],
      from: ['From', 'source'],
      status: ['Status']
    }
  });

  report.checks.master_log = {
    headerCount: mlHeaders.length,
    ok: mlMap.ok,
    missing: mlMap.missing
  };
  report.checks.inbox = {
    headerCount: ibHeaders.length,
    ok: ibMap.ok,
    missing: ibMap.missing
  };

  report.ok = mlMap.ok && ibMap.ok;
  outAndExit(report.ok, report);
} catch (e) {
  report.error = e?.message || String(e);
  outAndExit(false, report);
}
