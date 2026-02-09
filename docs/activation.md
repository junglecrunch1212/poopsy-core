# Activation (poopsy-core)

This repo is an OpenClaw skill skeleton.

## 0) Prereqs
- OpenClaw running
- You have this repo on the OpenClaw machine (or can git clone it)

## 1) Install dependencies
From the repo root:

```bash
cd /data/.openclaw/workspace/projects/poopsy-core
npm install
npm test
npm run sanitize
```

## 2) Install as an OpenClaw skill
From the same machine where OpenClaw runs:

```bash
openclaw skill install /data/.openclaw/workspace/projects/poopsy-core
```

## 3) Configure (STERILE → LIVE)
Do **not** commit real IDs.

- Copy `config/connections.yaml` and `config/household.yaml` into your live workspace config area (or mount them as secrets) and fill:
  - Google Sheet IDs
  - Calendar IDs
  - People/channels

## 4) Smoke test
Run one loop step and confirm a receipt is written:

```bash
node scripts/observe.mjs
node scripts/probe_action_ledger.mjs
```

You should see `PROBE_OK`.
