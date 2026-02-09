# poopsy-core — OpenClaw Skill

Minimal, portable core loop for Poopsy-in-a-Box.

## What this skill is
A clean, testable spine:

- observe → decide → act → learn
- probes + receipts (no "phantom success")
- sterile repo (no household PII/IDs)

## How to run (dev)

- Sanity tests:
  - `npm test`
  - `npm run sanitize`

## Contracts (WIP)
- No external writes without: pre-check → write → read-back → receipt
- Secrets/PII must never be committed; CI enforces sanitize gate.
