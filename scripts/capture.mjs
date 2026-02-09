#!/usr/bin/env node
// capture — v1: append tasks to Life OS INBOX with idempotency + read-back + receipt

import { append as receipt } from './lib/action_ledger.mjs';
import { idempotencyKey } from './lib/idempotency.mjs';
import { appendInboxTask } from './lib/lifeos_inbox.mjs';

function arg(name, def = null) {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length) : def;
}

const action = arg('action');
const person = arg('person', '');
const text = arg('text', '');
const sourceId = arg('sourceId', '');
const inboxId = arg('id', '');
const dryRun = process.argv.includes('--dry-run');

if (!action) {
  console.log('Usage: node scripts/capture.mjs --action=task --person=james --text="..." [--sourceId=...] [--dry-run]');
  process.exit(2);
}

(async () => {
  const ts = new Date().toISOString();

  try {
    if (action !== 'task' && action !== 'done') throw new Error(`unsupported action: ${action}`);

    if (action === 'task') {
      if (!text.trim()) throw new Error('--text is required');

      const idem = idempotencyKey({ kind: 'task', person, text: text.trim(), sourceId });

      if (dryRun) {
        receipt({ intent: 'capture', result: 'dry_run', ok: true, ts, target: 'life_os:INBOX', detail: { action, person, idempotency: idem } });
        console.log(JSON.stringify({ status: 'dry_run', action, person, idempotency: idem }, null, 2));
        process.exit(0);
      }

      const res = await appendInboxTask({
        from: `capture:${person || 'unknown'}`,
        status: 'new',
        title: text.trim(),
        notes: '',
        owner: person ? person[0].toUpperCase() + person.slice(1) : '',
        idempotency: idem
      });

      receipt({
        intent: 'capture',
        result: res.verified ? 'ok_verified' : 'ok_unverified',
        ok: true,
        ts,
        target: 'life_os:INBOX',
        detail: { action, person, id: res.id, verified: res.verified, idempotency: idem, warning: res.warning || null }
      });

      console.log(JSON.stringify({ status: 'ok', action, person, id: res.id, verified: res.verified, idempotency: idem, warning: res.warning || null }, null, 2));
      process.exit(0);
    }

    // action === done
    if (!inboxId) throw new Error('--id is required for action=done (INB-...)');
    if (dryRun) {
      receipt({ intent: 'capture', result: 'dry_run', ok: true, ts, target: 'life_os:INBOX', detail: { action, person, id: inboxId } });
      console.log(JSON.stringify({ status: 'dry_run', action, person, id: inboxId }, null, 2));
      process.exit(0);
    }

    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('node', ['scripts/complete_inbox.mjs', `--id=${inboxId}`], { encoding: 'utf8' });
    const ok = (r.status ?? 1) === 0;

    receipt({ intent: 'capture', result: ok ? 'done_ok' : 'done_error', ok, ts, target: 'life_os:INBOX', detail: { action, person, id: inboxId, stderr: (r.stderr || '').slice(-400) } });

    if (!ok) throw new Error((r.stdout || r.stderr || 'done failed').slice(-800));

    console.log((r.stdout || '').trim() || JSON.stringify({ status: 'ok', action, id: inboxId }, null, 2));
    process.exit(0);

    const idem = idempotencyKey({ kind: 'task', person, text: text.trim(), sourceId });

    if (dryRun) {
      receipt({ intent: 'capture', result: 'dry_run', ok: true, ts, target: 'life_os:INBOX', detail: { action, person, idempotency: idem } });
      console.log(JSON.stringify({ status: 'dry_run', action, person, idempotency: idem }, null, 2));
      process.exit(0);
    }

    const res = await appendInboxTask({
      from: `capture:${person || 'unknown'}`,
      status: 'new',
      title: text.trim(),
      notes: '',
      owner: person ? person[0].toUpperCase() + person.slice(1) : '',
      idempotency: idem
    });

    receipt({
      intent: 'capture',
      result: res.verified ? 'ok_verified' : 'ok_unverified',
      ok: true,
      ts,
      target: 'life_os:INBOX',
      detail: { action, person, id: res.id, verified: res.verified, idempotency: idem, warning: res.warning || null }
    });

    console.log(JSON.stringify({ status: 'ok', action, person, id: res.id, verified: res.verified, idempotency: idem, warning: res.warning || null }, null, 2));
    process.exit(0);
  } catch (e) {
    receipt({ intent: 'capture', result: 'error', ok: false, ts, error: e?.message || String(e), detail: { action, person } });
    console.log(JSON.stringify({ status: 'error', action, person, error: e?.message || String(e) }, null, 2));
    process.exit(1);
  }
})();
