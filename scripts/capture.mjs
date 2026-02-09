#!/usr/bin/env node
// capture — WIP
import { append as receipt } from './lib/action_ledger.mjs';

const out = { status: 'not_configured', step: 'capture' };
receipt({ intent: 'capture', result: 'not_configured', ok: false, detail: out });

console.log(JSON.stringify(out, null, 2));
process.exit(0);
