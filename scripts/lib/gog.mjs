// gog.mjs — thin wrapper around the `gog` CLI (Google Workspace)
// NOTE: v1 uses CLI execution for speed; later we can replace with a direct integration.

import { execSync } from 'child_process';

export function gog(cmd, { json = false, timeoutMs = 30000 } = {}) {
  const full = `gog ${cmd}${json ? ' --json' : ''}`;
  try {
    const out = execSync(full, { encoding: 'utf8', timeout: timeoutMs });
    return { ok: true, cmd: full, out: out.trim() };
  } catch (e) {
    return { ok: false, cmd: full, error: e?.message || String(e) };
  }
}

export function gogJson(cmd, opts = {}) {
  const r = gog(cmd, { ...opts, json: true });
  if (!r.ok) return r;
  try {
    return { ...r, data: JSON.parse(r.out) };
  } catch (e) {
    return { ok: false, cmd: r.cmd, error: `JSON parse failed: ${e?.message || e}` };
  }
}
