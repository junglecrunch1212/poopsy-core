#!/usr/bin/env node
// decide — v1: pick a single Top-1 next action from state/signals.json

import fs from 'fs';
import path from 'path';
import { append as receipt } from './lib/action_ledger.mjs';

const ROOT = path.resolve(process.cwd());
const STATE_DIR = path.join(ROOT, 'state');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function pickTop1(signals) {
  const t = (signals.top3 || [])[0];
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    owner: t.owner,
    score: t.score,
    why: 'Top score_now from Life OS _MASTER_LOG'
  };
}

const ts = new Date().toISOString();
try {
  const signalsPath = path.join(STATE_DIR, 'signals.json');
  if (!fs.existsSync(signalsPath)) throw new Error('missing state/signals.json — run observe first');

  const signals = readJson(signalsPath);
  const top1 = pickTop1(signals);

  const decisions = {
    ts,
    status: 'ok',
    top1,
    prompt: top1
      ? `Reply with: done:${top1.id} OR swap (give me a different focus)`
      : 'Reply with: run observe (no tasks found)'
  };

  writeJson(path.join(STATE_DIR, 'decisions.json'), decisions);

  receipt({ intent: 'decide', result: top1 ? 'ok' : 'ok_empty', ok: true, target: 'state/signals.json', detail: { top1: top1?.title || null } });

  console.log(JSON.stringify(decisions, null, 2));
  process.exit(0);
} catch (e) {
  receipt({ intent: 'decide', result: 'error', ok: false, error: e?.message || String(e) });
  console.log(JSON.stringify({ ts, status: 'error', error: e?.message || String(e) }, null, 2));
  process.exit(1);
}
