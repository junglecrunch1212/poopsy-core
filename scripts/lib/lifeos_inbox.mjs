// lifeos_inbox.mjs — append-only writes to Life OS INBOX with read-back verification

import { gogJson } from './gog.mjs';
import { loadConnections, assertConfigured } from './config.mjs';

function nowIso() {
  return new Date().toISOString();
}

function genInboxId() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `INB-${ymd}-${seq}`;
}

export async function appendInboxTask({ from = 'poopsy-core', status = 'new', ref = '', quickNote = '', title, notes = '', owner = '', category = '', idempotency = '' }) {
  if (!title) throw new Error('title is required');

  const conn = loadConnections();
  const lifeId = conn?.google_sheets?.life_os?.sheet_id;
  assertConfigured(lifeId, 'google_sheets.life_os.sheet_id');

  const id = genInboxId();
  const when = nowIso();

  // INBOX schema (A..M):
  // [ID, When, From, Status, Ref, Quick Note, Task Title, Notes, Owner?, Category?, Moved To, Moved On, Ready?]
  // We'll store idempotency in Ref if provided.
  const row = [
    id,
    when,
    from,
    status,
    idempotency ? `idem:${idempotency}` : ref,
    quickNote,
    title,
    notes,
    owner,
    category,
    '',
    '',
    ''
  ];

  // Append
  const app = gogJson(
    `sheets append ${lifeId} "INBOX!A2:M" --values-json '${JSON.stringify([row]).replace(/'/g, "'\\''")} ' --insert INSERT_ROWS`
  );
  if (!app.ok) throw new Error(`append failed: ${app.error}`);

  // Read-back verify: pull last ~25 rows and confirm the ID exists
  const verify = gogJson(`sheets get ${lifeId} "INBOX!A2:M"`);
  if (!verify.ok) {
    return { ok: true, verified: false, id, warning: `append ok; verify read failed: ${verify.error}` };
  }
  const values = verify.data?.values || [];
  const tail = values.slice(-25);
  const found = tail.some(r => r && r[0] === id);

  return { ok: true, verified: found, id };
}
