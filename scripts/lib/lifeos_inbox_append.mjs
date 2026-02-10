// lifeos_inbox_append.mjs — header-driven, tab-configurable INBOX append with readback
//
// Unlike lifeos_inbox.mjs (which hardcodes column positions and the INBOX tab),
// this module reads the header row first and places values by column name.
// Works with any INBOX-shaped tab (INBOX, INBOX_SANDBOX, etc.).

import { gogJson } from './gog.mjs';
import { buildHeaderMap } from './header_map.mjs';

function nowIso() {
  return new Date().toISOString();
}

function genInboxId() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `INB-${ymd}-${seq}`;
}

// Convert 0-based column index to A1 letter(s): 0→A, 25→Z, 26→AA
function colLetter(n) {
  let s = '';
  let i = n;
  while (i >= 0) {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  }
  return s;
}

// Header aliases: normalized key → possible raw header spellings
const INBOX_ALIASES = {
  id:          ['inbox_id'],
  task_title:  ['title', 'task title'],
  quick_note:  ['quick note', 'quicknote'],
  moved_to:    ['moved to', 'movedto'],
  moved_on:    ['moved on', 'movedon'],
};

/**
 * Append a row to any INBOX-shaped tab with header-driven column placement.
 *
 * @param {object} opts
 * @param {string} opts.sheetId  - Google Sheet ID
 * @param {string} opts.tab      - Tab name (e.g. "INBOX_SANDBOX")
 * @param {object} opts.fields   - Values keyed by normalized column name:
 *   { from, status, ref, quick_note, task_title, notes, owner, category }
 *   id and when are auto-generated if omitted.
 * @returns {Promise<{ ok, verified, id, warning? }>}
 */
export async function appendToInbox({ sheetId, tab, fields }) {
  // 1. Read header row
  const hdr = gogJson(`sheets get ${sheetId} "'${tab}'!1:1"`);
  if (!hdr.ok) throw new Error(`header read failed for ${tab}: ${hdr.error}`);

  const headers = hdr.data?.values?.[0];
  if (!headers || headers.length === 0) throw new Error(`no headers found in ${tab}`);

  const map = buildHeaderMap(headers, {
    required: ['id', 'task_title'],
    aliases: INBOX_ALIASES,
  });

  if (!map.ok) throw new Error(`${tab} missing required columns: ${map.missing.join(', ')}`);

  // 2. Build row — auto-generate ID and timestamp
  const id   = fields.id   || genInboxId();
  const when = fields.when || nowIso();

  const vals = {
    id,
    when,
    from:       fields.from       || 'intake-router',
    status:     fields.status     || 'new',
    ref:        fields.ref        || '',
    quick_note: fields.quick_note || '',
    task_title: fields.task_title || fields.title || '',
    notes:      fields.notes      || '',
    owner:      fields.owner      || '',
    category:   fields.category   || '',
    moved_to:   '',
    moved_on:   '',
    ready:      '',
  };

  // Place values into a row array by header position (pad full width)
  const row = new Array(headers.length).fill('');
  for (const [key, value] of Object.entries(vals)) {
    const idx = map.idx(key);
    if (idx >= 0) row[idx] = value;
  }

  // 3. Append
  const last = colLetter(headers.length - 1);
  const range = `'${tab}'!A2:${last}`;
  const json = JSON.stringify([row]).replace(/'/g, "'\\''");

  const app = gogJson(
    `sheets append ${sheetId} "${range}" --values-json '${json}' --insert INSERT_ROWS`
  );
  if (!app.ok) throw new Error(`append to ${tab} failed: ${app.error}`);

  // 4. Readback verification — pull last ~25 rows, confirm ID exists
  const verify = gogJson(`sheets get ${sheetId} "${range}"`);
  if (!verify.ok) {
    return { ok: true, verified: false, id, warning: `append ok; readback failed: ${verify.error}` };
  }

  const dataRows = verify.data?.values || [];
  const idIdx = map.idx('id');
  const tail = dataRows.slice(-25);
  const found = tail.some(r => r && (r[idIdx] || '').trim() === id);

  return { ok: true, verified: found, id };
}
