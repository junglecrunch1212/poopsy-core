// idempotency.mjs — simple deterministic keys for capture

import crypto from 'crypto';

export function idempotencyKey({ kind, person = '', text = '', sourceId = '' }) {
  const base = `${kind}|${person}|${sourceId}|${text}`.trim();
  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 16);
}
