// lifeos_masterlog.mjs — safe append/promote into Life OS _MASTER_LOG

import { gogJson } from './gog.mjs';
import { loadConnections, assertConfigured } from './config.mjs';
import { buildHeaderMap } from './header_map.mjs';

function nowIso() {
  return new Date().toISOString();
}

function nowLocalMinute() {
  return nowIso().replace('T', ' ').slice(0, 16);
}

function genItemId() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `ITM-${ymd}-${seq}`;
}

function escJson(values) {
  // Escape single quotes for bash-safe single-quoted JSON
  return JSON.stringify(values).replace(/'/g, "'\\''");
}

export async function getMasterLogHeaderMap() {
  const conn = loadConnections();
  const lifeId = conn?.google_sheets?.life_os?.sheet_id;
  assertConfigured(lifeId, 'google_sheets.life_os.sheet_id');

  const r = gogJson(`sheets get ${lifeId} "_MASTER_LOG!A1:AT1"`);
  if (!r.ok) throw new Error(`_MASTER_LOG header read failed: ${r.error}`);
  const headers = r.data?.values?.[0] || [];

  const map = buildHeaderMap(headers, {
    required: ['item_id', 'title', 'owner', 'status', 'created_at', 'source_system', 'source_ref', 'inbox_id'],
    aliases: {
      item_id: ['id', 'item id'],
      created_at: ['created'],
      source_ref: ['source'],
    }
  });

  if (!map.ok) throw new Error(`_MASTER_LOG missing required headers: ${map.missing.join(', ')}`);
  return { lifeId, headers, map };
}

export async function appendMasterLogRow(fields) {
  const { lifeId, headers, map } = await getMasterLogHeaderMap();

  // Create a full-width row (A:AT) so we don’t misalign if new cols are inserted.
  const row = new Array(headers.length).fill('');

  const set = (key, value) => {
    const i = map.idx(key);
    if (i >= 0) row[i] = value ?? '';
  };

  const itemId = fields.item_id || genItemId();
  const createdAt = fields.created_at || nowIso();

  set('item_id', itemId);
  set('item_type', fields.item_type || 'task');
  set('title', fields.title || '');
  set('description', fields.description || '');
  set('domain', fields.domain || '');
  set('subdomain', fields.subdomain || '');
  set('owner', fields.owner || '');
  set('status', fields.status || 'inbox');
  set('priority', fields.priority || '');
  set('effort_minutes', fields.effort_minutes || '');
  set('due_date', fields.due_date || '');

  set('created_at', createdAt);
  set('created_by', fields.created_by || 'poopsy-core');
  set('updated_at', fields.updated_at || createdAt);
  set('updated_by', fields.updated_by || 'poopsy-core');

  set('source_system', fields.source_system || 'inbox');
  set('source_ref', fields.source_ref || '');
  set('inbox_id', fields.inbox_id || '');

  const app = gogJson(
    `sheets append ${lifeId} "_MASTER_LOG!A:AT" --values-json '${escJson([row])}' --insert INSERT_ROWS`
  );
  if (!app.ok) throw new Error(`_MASTER_LOG append failed: ${app.error}`);

  // Best-effort: return itemId (we generated it)
  return { ok: true, itemId, updatedRange: app.data?.updatedRange || null };
}

export { genItemId, nowLocalMinute };
