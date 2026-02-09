// header_map.mjs
// Build a resilient column index map from a header row.
//
// Usage:
//   const map = buildHeaderMap(headers, { required: ['item_id','title'] })
//   const idx = map.idx('title')
//
// Notes:
// - Normalizes header names (trim, lower, collapse whitespace, snake_case-ish)
// - Supports aliases (e.g., { item_id: ['id','item id'] })

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s/g, '_');
}

export function buildHeaderMap(headers, opts = {}) {
  const { required = [], aliases = {} } = opts;

  const byKey = new Map();
  headers.forEach((h, i) => {
    const k = norm(h);
    if (k) byKey.set(k, i);
  });

  function resolveKey(key) {
    const k = norm(key);
    if (byKey.has(k)) return { key: k, index: byKey.get(k) };

    const al = aliases[key] || aliases[k] || [];
    for (const a of al) {
      const ak = norm(a);
      if (byKey.has(ak)) return { key: ak, index: byKey.get(ak) };
    }

    return { key: k, index: -1 };
  }

  const missing = [];
  for (const r of required) {
    const { index } = resolveKey(r);
    if (index < 0) missing.push(r);
  }

  return {
    headers,
    normalized: headers.map(norm),
    missing,
    ok: missing.length === 0,
    idx: (key) => resolveKey(key).index,
    resolve: (key) => resolveKey(key)
  };
}
