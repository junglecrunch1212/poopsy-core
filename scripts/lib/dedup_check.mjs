// dedup_check.mjs — header-driven idempotency check against INBOX rows
//
// Scans the Ref column (found via header map, not hardcoded index) for
// existing idem:<key> values. Returns { duplicate, existingRow? }.

import { gogJson } from './gog.mjs';
import { buildHeaderMap } from './header_map.mjs';

/**
 * Check if an idempotency key already exists in the given tab.
 *
 * @param {string} idemKey - The idempotency hash (without "idem:" prefix)
 * @param {object} opts
 * @param {string} opts.sheetId - Google Sheet ID
 * @param {string} opts.tab     - Tab name (e.g. "INBOX_SANDBOX")
 * @param {number} [opts.maxScan=50] - Max recent rows to check
 * @returns {Promise<{ duplicate: boolean, existingRow?: number, error?: string }>}
 */
export async function isDuplicate(idemKey, { sheetId, tab, maxScan = 50 }) {
  const needle = `idem:${idemKey}`;

  // Single API call: headers (row 1) + all data rows
  const res = gogJson(`sheets get ${sheetId} "'${tab}'!A1:Z"`);
  if (!res.ok) return { duplicate: false, error: `sheet read failed: ${res.error}` };

  const allRows = res.data?.values || [];
  if (allRows.length < 2) return { duplicate: false }; // headers only or empty

  const headers = allRows[0];
  const dataRows = allRows.slice(1);

  const map = buildHeaderMap(headers, {
    required: ['ref'],
    aliases: { ref: ['reference', 'ref_idempotency', 'idempotency'] }
  });

  if (!map.ok) {
    return { duplicate: false, error: `missing required columns: ${map.missing.join(', ')}` };
  }

  const refIdx = map.idx('ref');
  const tail = dataRows.slice(-maxScan);

  for (let i = tail.length - 1; i >= 0; i--) {
    const val = (tail[i]?.[refIdx] || '').trim();
    if (val === needle) {
      // Absolute row number: header is row 1, data starts row 2
      const absRow = dataRows.length - tail.length + i + 2;
      return { duplicate: true, existingRow: absRow };
    }
  }

  return { duplicate: false };
}
