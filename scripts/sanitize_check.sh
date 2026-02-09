#!/usr/bin/env bash
set -euo pipefail

# poopsy-core sanitize check (repo safety gate)
# Fails if it detects common secrets/PII patterns.

ROOT="${1:-.}"

fail() { echo "SANITIZE_FAIL: $1" >&2; exit 1; }

# 1) No obvious tokens
if grep -RIn --exclude-dir=.git --exclude-dir=node_modules --exclude=sanitize_check.sh --exclude=probe_action_ledger.mjs -E "(api[_-]?key|Authorization:|Bearer [A-Za-z0-9._-]{12,}|xox[baprs]-|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})" "$ROOT"; then
  fail "token-like string found"
fi

# 2) No Google Sheet IDs (very common leak)
# (Docs can mention the concept, but not real IDs.)
if grep -RIn --exclude-dir=.git --exclude-dir=node_modules -E "https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]{20,}" "$ROOT"; then
  fail "Google Sheets URL/id found"
fi

# 3) No emails except example.com
if grep -RIn --exclude-dir=.git --exclude-dir=node_modules -E "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" "$ROOT" | grep -v -E "@example\.com"; then
  fail "email address found (non-example.com)"
fi

echo "OK: sanitization check passed."
