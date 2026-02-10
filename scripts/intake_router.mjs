#!/usr/bin/env node
// intake_router.mjs — deterministic intake router
//
// Single entry point for all inbound items (WhatsApp, Gmail, calendar, manual).
// Classifies via pattern matching (no LLM), dedup-checks, appends to the
// appropriate INBOX tab, performs readback verification, and emits a receipt.
//
// Usage:
//   node scripts/intake_router.mjs \
//     --source=whatsapp --raw="Add task: call pediatrician" \
//     [--from=James] [--sourceId=msg-abc123] [--sandbox] [--dry-run]
//
// Default write target:
//   --sandbox  → INBOX_SANDBOX tab  (safe sink, no prod data touched)
//   (omitted)  → INBOX tab          (live — requires explicit approval)

import { append as receipt } from './lib/action_ledger.mjs';
import { idempotencyKey }    from './lib/idempotency.mjs';
import { isDuplicate }       from './lib/dedup_check.mjs';
import { appendToInbox }     from './lib/lifeos_inbox_append.mjs';
import { loadConnections, assertConfigured } from './lib/config.mjs';

// ── CLI args ────────────────────────────────────────────────────────────────

function arg(name, def = null) {
  const p = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(p));
  return hit ? hit.slice(p.length) : def;
}

const source   = arg('source');          // whatsapp | gmail | calendar | manual
const from     = arg('from', '');        // person name
const raw      = arg('raw', '');         // raw message text
const sourceId = arg('sourceId', '');    // external message/thread ID
const sandbox  = process.argv.includes('--sandbox');
const dryRun   = process.argv.includes('--dry-run');

if (!source || !raw.trim()) {
  console.log(
    'Usage: node scripts/intake_router.mjs --source=whatsapp ' +
    '--raw="Add task: ..." [--from=James] [--sourceId=...] [--sandbox] [--dry-run]'
  );
  process.exit(2);
}

// ── Classify (deterministic pattern matching — no LLM) ──────────────────────

function classify(text) {
  const t = text.trim();

  // Explicit task prefix
  if (/^(add\s+task|task|todo|to-?do)\s*:/i.test(t)) {
    return {
      kind: 'task',
      title: t.replace(/^(add\s+task|task|todo|to-?do)\s*:\s*/i, '').trim(),
    };
  }

  // Explicit list-item prefix
  if (/^(add\s+to\s+list|list\s+item|list)\s*:/i.test(t)) {
    return {
      kind: 'task',
      title: t.replace(/^(add\s+to\s+list|list\s+item|list)\s*:\s*/i, '').trim(),
      category: 'list',
    };
  }

  // Explicit calendar/schedule prefix → flag only, no cal write
  if (/^(schedule|event|calendar|cal)\s*:/i.test(t)) {
    return {
      kind: 'calendar_candidate',
      title: t.replace(/^(schedule|event|calendar|cal)\s*:\s*/i, '').trim(),
    };
  }

  // Fallback: capture raw text as "needs triage" — NOT as an authoritative task
  return { kind: 'capture', title: t };
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  const ts = new Date().toISOString();

  // Load config
  const conn   = loadConnections();
  const lifeId = conn?.google_sheets?.life_os?.sheet_id;
  assertConfigured(lifeId, 'google_sheets.life_os.sheet_id');

  // Resolve target tab
  const tabs = conn?.google_sheets?.life_os?.tabs || {};
  const targetTab = sandbox
    ? (tabs.inbox_sandbox || 'INBOX_SANDBOX')
    : (tabs.inbox || 'INBOX');

  // Classify + generate idempotency key
  const classified = classify(raw);
  const idem = idempotencyKey({
    kind: classified.kind,
    person: from,
    text: raw.trim(),
    sourceId,
  });

  // Common receipt detail (no PII beyond what capture.mjs already logs)
  const detail = {
    source,
    from:       from || null,
    sourceId:   sourceId || null,
    kind:       classified.kind,
    title:      classified.title,
    category:   classified.category || null,
    idempotency: idem,
    targetTab,
    sandbox,
  };

  try {
    // ── Dry run ───────────────────────────────────────────────────────────
    if (dryRun) {
      receipt({
        intent: 'intake_route', result: 'dry_run', ok: true, ts,
        target: `life_os:${targetTab}`, detail,
      });
      console.log(JSON.stringify({ status: 'dry_run', ...detail }, null, 2));
      process.exit(0);
    }

    // ── Dedup check ───────────────────────────────────────────────────────
    const dup = await isDuplicate(idem, { sheetId: lifeId, tab: targetTab });

    if (dup.error) {
      // Dedup check failed — fail-open (better to risk a dup than lose data)
      detail.dedupWarning = dup.error;
    } else if (dup.duplicate) {
      receipt({
        intent: 'intake_route', result: 'skipped_duplicate', ok: true, ts,
        target: `life_os:${targetTab}`,
        detail: { ...detail, existingRow: dup.existingRow },
      });
      console.log(JSON.stringify({
        status: 'skipped_duplicate',
        existingRow: dup.existingRow,
        ...detail,
      }, null, 2));
      process.exit(0);
    }

    // ── Append to INBOX tab ───────────────────────────────────────────────
    // Preserve raw text in notes when classifier stripped a prefix
    const rawPreserved = classified.title !== raw.trim() ? raw.trim() : '';

    const fields = {
      from:       `${source}:${from || 'unknown'}`,
      status:     'new',
      ref:        `idem:${idem}`,
      quick_note: classified.kind !== 'task' ? `[${classified.kind}]` : '',
      task_title: classified.title,
      notes:      rawPreserved,
      owner:      from ? from[0].toUpperCase() + from.slice(1) : '',
      category:   classified.category || '',
    };

    const res = await appendToInbox({ sheetId: lifeId, tab: targetTab, fields });

    const result = res.verified ? 'appended' : 'appended_unverified';
    receipt({
      intent: 'intake_route', result, ok: true, ts,
      target: `life_os:${targetTab}`,
      detail: {
        ...detail,
        id: res.id, verified: res.verified,
        warning: res.warning || null,
      },
    });

    console.log(JSON.stringify({
      status: result,
      id: res.id,
      verified: res.verified,
      ...detail,
      warning: res.warning || null,
    }, null, 2));
    process.exit(0);

  } catch (e) {
    receipt({
      intent: 'intake_route', result: 'error', ok: false, ts,
      target: `life_os:${targetTab}`,
      error: e?.message || String(e),
      detail,
    });
    console.log(JSON.stringify({
      status: 'error',
      error: e?.message || String(e),
      ...detail,
    }, null, 2));
    process.exit(1);
  }
})();
