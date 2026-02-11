# System Context — Poopsy-in-a-Box / poopsy-core

> **Purpose:** Single "boot me up" doc for any new Claude session. Read this first, ask questions second.
> **Last updated:** 2026-02-10 by Claude Code session
> **Maintainer:** Poopsy should update this during heartbeats when things change.

---

## 1. Who's Who

- **Human:** Bossman (primary user, see VPS `USER.md` for details)
- **Agent:** Poopsy 💩 (private) / Mr. Whoops (public) — AI household Chief of Staff
- **Platform:** OpenClaw (open-source AI assistant, formerly Clawdbot/Moltbot), self-hosted
- **Goal:** Better-than-human Household Chief of Staff — proactive executive assistant + ADHD/health execution coach for two co-heads of household

### Bossman quick facts
- INFP with ADHD — proactive check-ins, break down overwhelm, capture immediately, celebrate wins
- Runs a small professional services firm (~10 hrs/week), partner is co-head of household
- Growing family (young children)
- Complete beginner to command line and coding — no jargon without explanation
- Prefers bullet points, time estimates, systems/frameworks
- Timezone: America/New_York (EST)

---

## 2. Infrastructure

### VPS
- **Host:** Hostinger VPS, Docker 1-click deploy (Feb 2026)
- **Tailscale IP:** 100.106.15.26
- **Tailscale on:** VPS, Windows PC, iPhone

### OpenClaw paths (on VPS host, NOT inside container)
| What | Path |
|---|---|
| OpenClaw data | `/docker/openclaw-eipl/data/.openclaw/` |
| Workspace | `/docker/openclaw-eipl/workspace/` (also `/data/.openclaw/workspace/` inside container) |
| Cron jobs | `/docker/openclaw-eipl/data/.openclaw/cron/jobs.json` |
| Config | `/docker/openclaw-eipl/data/.openclaw/openclaw.json` |
| Active automation project | `/data/.openclaw/workspace/projects/poopsy-in-a-box/` |
| Sterile skill repo | `/data/.openclaw/workspace/projects/poopsy-core/` |
| Live config overrides | `/data/.openclaw/workspace/poopsy-core-live/` |
| Secrets | `/data/.openclaw/.secrets/` (e.g. `gog_keyring_password`) |

### Integration status
| Integration | Status | Details |
|---|---|---|
| WhatsApp | **Connected** | Gateway linked, messages flowing. Occasional transient HTTP 499 disconnect/reconnect events but self-heals. |
| Gmail (via `gog`) | **Read-only working** | `gog gmail list/read` works. Triage cron runs every 2h (08:00–20:00 ET). GOG_ACCOUNT set (see VPS config). |
| Google Calendar | **IDs configured in os_links.yaml; reads not yet verified** | `os_links.yaml` has `family_ssot` + `holds_tentative` calendar IDs. `connections.yaml` still has `__PENDING__` (stale). Need to verify reads work via `gog calendar list --calendar-id <FAMILY_SSOT_ID>`. No write scripts exist yet. |
| Google Sheets | **Reads working; writes not yet proven** | Reads from Life OS INBOX + _MASTER_LOG work. Live writes are gated. Sandbox sheet exists (separate spreadsheet) but sandbox tabs (INBOX, _PROBE_LOG) may not be created yet — verify before writing. |
| Tailscale | **Working** | VPS + PC + iPhone connected |

### Key policy: Write gates
- **Reads:** OK everywhere, no approval needed
- **Sandbox sheet writes:** Approved in principle. Sandbox is a **separate spreadsheet** (not a tab in prod). Tabs must exist before writes work — verify with `gog sheets list-tabs <SANDBOX_ID>`.
- **Production sheet writes:** Require explicit Bossman approval + idempotency + readback verification
- **Calendar reads:** IDs configured in `os_links.yaml` but reads not verified yet. Need `gog calendar list` test.
- **Calendar writes:** Not yet enabled. Intentionally guarded (anti-nag posture).
- **Email sends:** Never without asking first

---

## 3. The Two Repos

### poopsy-core (this repo — sterile skill skeleton)
- **GitHub:** `<org>/poopsy-core` (see VPS config for org)
- **Purpose:** Minimal, portable core loop. The clean "spine" — no PII, no real IDs committed.
- **Pattern:** observe → decide → act → learn
- **Contract:** No external writes without pre-check → write → read-back → receipt

#### Scripts
| Script | What it does |
|---|---|
| `observe.mjs` | Read top 3 scored tasks from _MASTER_LOG → `state/signals.json` |
| `decide.mjs` | Pick top 1 from signals → `state/decisions.json` |
| `capture.mjs` | Append task to INBOX (action=task), mark processed (action=processed), promote (action=promote) |
| `intake_router.mjs` | **PROPOSED** — Not yet adopted. Designed as deterministic classifier + router. WhatsApp/Gmail/calendar/manual → classify → dedup → append to sandbox INBOX → readback → receipt |
| `promote_inbox.mjs` | Single row: INBOX → _MASTER_LOG with read-back |
| `complete_inbox.mjs` | Mark INBOX row as processed/done |
| `poll_inbox_promotions.mjs` | Auto-promote Status="promoted" rows (batch, max 10) |
| `promote_batch.mjs` | Legacy batch promote via subprocess |
| `probe_action_ledger.mjs` | Health check: ledger exists, writable, no secrets |
| `probe_life_os_read.mjs` | Health check: Life OS sheets readable, headers correct |
| `learn.mjs` | WIP stub |
| `backup.mjs` | WIP stub |

#### Libs (`scripts/lib/`)
| Module | What it does |
|---|---|
| `gog.mjs` | Thin wrapper around `gog` CLI. `gog(cmd)` and `gogJson(cmd)`. 30s timeout. |
| `config.mjs` | Loads `connections.yaml` + `household.yaml`. Checks live override path first, falls back to sterile template. |
| `lifeos_inbox.mjs` | Original INBOX append (hardcoded column positions, hardcoded "INBOX" tab). Used by `capture.mjs`. |
| `lifeos_inbox_append.mjs` | **PROPOSED** — Header-driven, tab-configurable append. Works with any INBOX-shaped tab. Designed for use by `intake_router.mjs`. Not yet adopted. |
| `lifeos_masterlog.mjs` | _MASTER_LOG append with header-driven column map. `appendMasterLogRow(fields)` + `getMasterLogHeaderMap()`. |
| `header_map.mjs` | `buildHeaderMap(headers, { required, aliases })` — resilient column resolution by normalized name. |
| `idempotency.mjs` | `idempotencyKey({ kind, person, text, sourceId })` — SHA256 first 16 chars. |
| `dedup_check.mjs` | **PROPOSED** — `isDuplicate(idemKey, { sheetId, tab, maxScan })` — header-driven scan of Ref column for existing `idem:<key>`. Not yet adopted. |
| `action_ledger.mjs` | Append-only JSONL receipt log. `append(entry)` → `data/ledger/action-ledger.jsonl`. |

#### Config (sterile templates — real values in live override path)
- `config/connections.yaml` — Sheet IDs (`__PENDING__`), Calendar IDs (`__PENDING__`), tab names
- `config/household.yaml` — Household name, timezone, agent_name, people

#### CI
- `.github/workflows/ci.yml` — Node 22, runs `npm test` + `npm run sanitize`
- `scripts/sanitize_check.sh` — Blocks commits containing tokens, API keys, Google Sheets URLs, real emails

### poopsy-in-a-box (on VPS — the full automation project)
- **GitHub:** `<org>/poopsy-in-a-box` (see VPS config for org)
- **Purpose:** Full household Chief of Staff project — skills, modules, policies, research, briefings
- **Location on VPS:** `/data/.openclaw/workspace/projects/poopsy-in-a-box/`

#### Verified from VPS (2026-02-10)

**STATUS.md:** Present, last updated 2026-02-08. Notes calendar SSOT IDs still `__PENDING__`.
**ROADMAP.md:** Present, last updated 2026-02-08. Principles include sandbox-first + _PROBE_LOG as safe sink.

#### Module registry (`workspace-template/modules.json`)
| Module | Enabled | Notes |
|---|---|---|
| `lifeos_sheets` | **yes** | Expects `household_os.production_sheet_id` + `sandbox_sheet_id` from os_links. _PROBE_LOG referenced for sandbox probe. |
| `calendar_ssot` | no | Exists but disabled |
| `gmail_triage` | no | Exists but disabled |

#### State files (on VPS — note: earned_access is at workspace root, NOT under projects)

**`state/loop_state.json`** (excerpt):
```json
{
  "version": 1,
  "updatedAt": "2026-02-10T09:05:56Z",
  "activeMilestone": {
    "id": "phase0-domain-model-layer",
    "title": "Adopt the Domain Model Layer (oak DNA)",
    "phase": "Phase 0"
  },
  "signals": {
    "lastKnown": {
      "whatsappConnected": true,
      "providersHealthy": false,
      "cronHealthy": true,
      "diskOk": true,
      "diskUsePct": 49
    }
  }
}
```

**`/data/.openclaw/workspace/state/earned_access.json`:**
```json
{
  "mode": "locked",
  "today": {
    "date": "2026-02-10",
    "completed": {
      "exercise": true,
      "captain": false,
      "honey_do": false,
      "house_reset": false
    }
  }
}
```

#### Other confirmed items
- **`inbox_rules.yaml`:** Present at `/data/.openclaw/workspace/inbox_rules.yaml`. Includes trusted domains + notify/ignore keyword heuristics + Xfinity/Peacock suppression.
- **OpenClaw skills:** 9/50 ready. Key skill: `gog` (Google Workspace CLI) is installed and ready.
- **gog auth:** OAuth, account set (see VPS config), credentials exist. Config file does not exist (uses defaults).

#### Still unknown (need deeper VPS exploration)
- [ ] Full file tree of poopsy-in-a-box (excluding .git)
- [ ] Individual script contents: `calendar_spine.mjs`, `lifeos_drift_watch.mjs`, `lifeos_diff.mjs`, `earned_access_gatekeeper.mjs`, `build_lock.sh`, `repo_coherence_audit.mjs`, `rebuild_doc_check.mjs`, `skill_security_audit.mjs`, `probe_modules.mjs`
- [ ] `briefings/` template structure + `suppressions.yaml`
- [ ] `research/loops/` definitions
- [ ] `state/token_burn_watch.json` snapshot
- [ ] `providersHealthy: false` — which provider is unhealthy?

---

## 4. Google Sheets — Life OS

### Sheets — two-sheet model (production + sandbox)

The sandbox is a **separate spreadsheet**, not a tab in the production sheet. This matches `workspace-template/modules.json` which expects `household_os.production_sheet_id` + `household_os.sandbox_sheet_id` from `os_links.yaml`.

| Sheet | ID suffix | Notes |
|---|---|---|
| Life OS (production) | `...mlcc3k` | Full ID in `os_links.yaml` on VPS |
| Life OS (sandbox) | `...pohE` | Full ID in `os_links.yaml` on VPS |
| Financial OS (production) | `...jbLXA` | Full ID in `os_links.yaml` on VPS |
| Financial OS (sandbox) | `...-18iU` | Full ID in `os_links.yaml` on VPS |

### Live connections (verified from `os_links.yaml` on VPS, 2026-02-10)

**SSOT is `os_links.yaml`**, NOT `connections.yaml` (which still has stale `__PENDING__` values for calendar).

**Sheets** (all verified ✓ — full IDs in `os_links.yaml` on VPS):
- `household_os.production_sheet_id`: `...mlcc3k` ✓
- `household_os.sandbox_sheet_id`: `...pohE` ✓
- `household_os.production_dashboard_gid`: present ✓
- `financial_os.production_sheet_id`: `...jbLXA` ✓
- `financial_os.sandbox_sheet_id`: `...-18iU` ✓

**Calendars** (full IDs in `os_links.yaml` on VPS):
- `calendars.google.account`: set ✓ (redacted for CI sanitize gate)
- `calendar_ids.primary`: `primary`
- `calendar_ids.family_ssot`: set ✓ (long hash `@group.calendar...`)
- `calendar_ids.holds_tentative`: set ✓ (long hash `@group.calendar...`)
- `outlook.partner_work_busy_ics_url`: `__PENDING__`
- `skylight`: disabled

### INBOX tab schema (row 1 = title/instructions, row 2 = headers, row 3+ = data)
**IMPORTANT:** Row 1 is a display row (`📥 Inbox ... Capture quick thoughts here`), NOT the header row. Headers are in row 2.
| Col | Header | Description |
|---|---|---|
| A | ID | `INB-YYYYMMDD-XXXX` (auto-generated) |
| B | When | ISO timestamp |
| C | From | Source (e.g. `whatsapp:<person>`, `capture:<person>`) |
| D | Status | `new`, `promoted`, `processed`, `done` |
| E | Ref | Idempotency key (`idem:<hash>`) or free text |
| F | Quick Note | Short context (e.g. `[calendar_candidate]`, `[capture]`) |
| G | Task Title | The actual task/item text (required) |
| H | Notes | Additional detail, raw text if prefix was stripped |
| I | Owner | Person name |
| J | Category | Optional grouping (e.g. `list`) |
| K | Moved To | `ITM-...` ID after promotion, or `poopsy-core` after completion |
| L | Moved On | Timestamp when promoted/processed |
| M | Ready? | Optional |

### _MASTER_LOG tab schema (row 1 = headers, row 2+ = data)
_(Confirmed: _MASTER_LOG headers ARE in row 1, unlike INBOX which has a title row.)_
Required columns: `item_id`, `title`, `owner`, `status`, `created_at`, `source_system`, `source_ref`, `inbox_id`

Full column set (from `appendMasterLogRow`): `item_id`, `item_type`, `title`, `description`, `domain`, `subdomain`, `owner`, `status`, `priority`, `effort_minutes`, `due_date`, `created_at`, `created_by`, `updated_at`, `updated_by`, `source_system`, `source_ref`, `inbox_id`

Range: A:AT (columns may extend beyond the above)

### Verified live headers (2026-02-10)

**INBOX row 2 (actual headers):**
`ID | When | From | Status | Ref | Quick Note | Task Title | Notes | Owner? | Category? | Moved To | Moved On | Ready?`
Matches schema above.

**_MASTER_LOG row 1 (actual headers):**
`item_id | item_type | title | description | domain | subdomain | owner | status | ...` (extends to column AT)
Matches schema above.

**INBOX_SANDBOX:** Was tested against the **production** sheet — does not exist there (expected). Should exist in the **sandbox** sheet (`...pohE`). Needs verification.
**_PROBE_LOG:** Same — not in prod sheet. Check sandbox sheet.

### Still unknown
- [ ] Dashboard tab structure (per-person / Next Top 3 views)
- [ ] Gamification system details (XP, levels, streaks)
- [ ] Full list of all tabs in the Life OS sheet

### Tab inventory — Production sheet (`...mlcc3k`)
| Tab | Purpose | Write policy |
|---|---|---|
| INBOX | Live capture inbox | Gated (approval required) |
| _MASTER_LOG | Promoted tasks, full metadata | Gated |
| Dashboard | Per-person / Next Top 3 views | Read-only from scripts |
| [UNKNOWN] | _Other tabs — run `gog sheets list-tabs`_ | _Fill in_ |

### Tab inventory — Sandbox sheet (`...pohE`)
| Tab | Purpose | Write policy |
|---|---|---|
| INBOX | Sandbox capture inbox for testing intake_router | Safe to write — **NEEDS VERIFICATION: does this tab exist?** |
| _PROBE_LOG | Probe/diagnostic sink | Safe to write (approved) — **NEEDS VERIFICATION: does this tab exist?** |
| [UNKNOWN] | _Run `gog sheets list-tabs <SANDBOX_ID>` to discover_ | _Fill in_ |

**IMPORTANT:** The intake_router should write to the **sandbox sheet's** INBOX tab, NOT to a sandbox tab in the production sheet.

---

## 5. OpenClaw Agent Files

All live at the workspace root on VPS. Key files:

| File | Purpose |
|---|---|
| `AGENTS.md` | Session boot protocol: read SOUL.md → USER.md → memory → MEMORY.md |
| `SOUL.md` | Personality, boundaries, coach mode, earned access rules |
| `USER.md` | Everything about Bossman — role, family, priorities, health, ADHD, preferences |
| `IDENTITY.md` | Name (Poopsy/Mr. Whoops), creature type, vibe, emoji |
| `TOOLS.md` | Local infra notes (cameras, SSH, TTS, contacts) |
| `MEMORY.md` | Curated long-term memory (big vision, infra status, lessons, active projects) |
| `HEARTBEAT.md` | Briefing quality improvement loop (micro-fix, noise audit, reliability check) |
| `memory/YYYY-MM-DD.md` | Daily raw logs |
| `memory/heartbeat-state.json` | Last check timestamps for email/calendar/weather/mentions |

### Earned Access system
- Bossman must complete 4 daily pillars: Exercise, Captain (dog training), Honey-Do (1 concrete item), House Reset
- Gatekeepers fire at 08:00 (≥1), 11:30 (≥2), 14:00 (≥3), 17:00 (all 4)
- When locked: only progress updates, plan next block, capture-only — no rabbit holes
- Override phrase: `BOSSMAN OVERRIDE: DO THE THING`
- State file: `state/earned_access.json` (mode=locked/unlocked)
- Log: `state/earned_access_log.jsonl`

---

## 6. Cron Jobs (43 total, as of 2026-02-10)

### Currently ENABLED (running)

| Job | Schedule | Type | Delivery |
|---|---|---|---|
| Gmail Inbox Triage | Every 2h 08:00–20:00 ET | isolated/agentTurn | WhatsApp + webchat (if actionable), else NO_REPLY |
| Earned Access Gatekeeper Runner | Every 30 min 07:00–20:00 ET | isolated/agentTurn | Runs `earned_access_gatekeeper.mjs`, NO_REPLY if clean |
| poopsy-core INBOX promote poll | Every 15 min 07:00–20:00 ET | isolated/agentTurn | Runs `poll_inbox_promotions.mjs`, NO_REPLY unless errors |
| Poopsy: Build Sprint | Hourly :05 07:00–20:00 ET | main/system | Autonomous 1–3 changes toward CoS milestones, lock-guarded |
| Poopsy: Sensor Sweep | Every 2h :05 | main/system | Gateway/channel/provider health, NO_REPLY unless down |
| PiB Token Burn Watch | Every 6h | isolated/agentTurn | Alerts if burn exceeds thresholds |
| Poopsy: Approval Queue | Every 2h :15 07:00–20:00 ET | main/system | Scans for NEEDS_APPROVAL items, sends batch to Bossman |
| Earned Access Gatekeeper — 08:00 | Daily 08:00 | main/system | ≥1 pillar check |
| Earned Access Gatekeeper — 11:30 | Daily 11:30 | main/system | ≥2 pillar check |
| Earned Access Gatekeeper — 14:00 | Daily 14:00 | main/system | ≥3 pillar check |
| Earned Access Gatekeeper — 17:00 | Daily 17:00 | main/system | All 4 pillar check |
| Morning Briefing (Household) | Daily 07:00 ET | main/system | Calendar + INBOX + top actions, anti-nag calendar rule |
| Daily AM Briefing (Mon–Sat) | Daily 07:30 ET | main/system | Calendar + Top 3 prompt + weather → WhatsApp + webchat |
| Daily CoS R&D Digest | Daily 07:15 ET | isolated/agentTurn | 3 ideas + 1 experiment + 1 risk → WhatsApp |
| Daily Competitive Intel (Dr. Whoops) | MWF 07:35 ET | main/system | 5 benchmark projects scan → competitive-intel-log.md |
| Daily Security Brief | Daily 07:40 ET | main/system | `openclaw security audit --deep` + update check |
| PIB Daily Briefing Improvement Pass | Daily 08:10 ET | main/system | One micro-tweak to briefing clarity/relevance |
| PiB Ops Intel Sweep | Daily 06:30 ET | isolated/agentTurn | Web research for agent ops patterns, actionable proposals only |
| Life OS Drift Watch | Daily 06:45 ET | isolated/agentTurn | Runs `lifeos_drift_watch.mjs`, alerts on drift |
| Poopsy: Daily No-Context Repo Audit | Daily 06:55 ET | isolated/agentTurn | External audit of public GitHub repo, drift score |
| PIB Weekly Briefing Retro | Sunday 16:00 ET | main/system | Week review, top 3 improvements, anti-nag audit |
| Poopsy: Weekly Phase Planner | Sunday 17:30 ET | main/system | Shipped/Next/Blockers/Approvals/Bold bet → WhatsApp |
| ChildDev Evidence Ladder Loop | Monday 07:10 ET | main/system | Weekly child-dev evidence card |
| PiB Skill Watch (ClawHub) | Every 3 days | isolated/agentTurn | Scan for new skills, security audit, recommend if useful |
| Poopsy: Integration + Regression | Every 6h | main/system | `openclaw status --deep` + security audit + connectivity |
| Emerald City Locks bagel reminder | One-shot 2026-05-27 09:00 | main/system | Reminder for partner (personal context in VPS config) |

### Currently DISABLED
| Job | Notes |
|---|---|
| 5pm Earned Access webchat check-ins (10:00, 13:00, 15:30, 16:30, 16:50) | Disabled — were chattiest token burners |
| 5pm Earned Access WhatsApp check-ins (10:00, 13:00, 15:30, 16:30, 16:50) | Disabled — same |
| Module probes (daily) | Disabled by default in template |
| Various one-shot reminders (daycare waitlists, proactive Poopsy, exercise starter) | Fired and disabled |

---

## 7. The Big Picture — What's Working vs. What's Missing

### Working (verified)
- OpenClaw running + WhatsApp connected + messages flowing
- Gmail read/triage every 2h (cron confirmed running)
- Google Sheets reads (INBOX + _MASTER_LOG confirmed via gog)
- `poll_inbox_promotions.mjs` cron runs every 15 min (but full write/promote pipeline not verified end-to-end recently)
- 25+ enabled cron jobs (briefings, earned access, build sprint, drift watch, intel)

### Not yet working / not verified
- Google Calendar — IDs configured in `os_links.yaml` but reads not yet tested via `gog calendar`
- Sandbox sheet writes — sandbox spreadsheet exists but tabs need verification (run `gog sheets list-tabs`)
- `_PROBE_LOG` concept approved but tab existence not verified in sandbox sheet
- Full INBOX append → promote → _MASTER_LOG pipeline not verified end-to-end
- `connections.yaml` calendar IDs are stale (`__PENDING__`) — `os_links.yaml` is the real SSOT

### The critical gap: No unified intake router
The system can **read** from Gmail and Sheets (not Calendar — IDs pending) and has **proposed** write modules, but there's no working pipe connecting sources to INBOX:

```
Gmail triage output ──┐
                      │   intake_router.mjs (PROPOSED, not yet adopted)
WhatsApp messages ────┤──────────────────────────────→ Sandbox sheet INBOX
                      │                                (then prod INBOX after approval)
Calendar invites ─────┘  (blocked — calendar IDs __PENDING__)
```

**`intake_router.mjs`** exists in the repo as a proposed script. It is designed to:
1. Classify inbound text (task / calendar_candidate / list / capture-needs-triage)
2. Dedup check against existing INBOX rows via idempotency key
3. Append to sandbox sheet INBOX (sandbox-first, no prod writes)
4. Readback verification
5. Receipt to action ledger

**Not yet adopted or tested against live sheets.**

### Remaining work to reach "Chief of Staff"
1. **Verify sandbox sheet** — confirm `os_links.yaml` has sandbox_sheet_id, list tabs, create INBOX tab if missing
2. **Adopt intake_router** — finalize the proposed scripts, test against sandbox sheet INBOX
3. **Wire intake_router into existing crons** — Gmail triage → intake_router, WhatsApp on-message → intake_router
4. **Configure calendar** — set SSOT calendar ID, test reads via `gog calendar list`
5. **Calendar write scripts** — `gog calendar create` for tasks with due dates (gated)
6. **Promotion to live** — after sandbox is proven, Bossman approves pointing at prod sheet
7. **on-message hook** — implement the WIP `hooks/on-message.md` contract

### Staged rollout
1. Verify sandbox sheet exists and has INBOX tab with correct headers
2. Adopt + test intake_router against sandbox sheet → readback proof → verify dedup works
3. Live INBOX writes (after Bossman approval) → same safety guarantees + `headerRow: 2` for prod
4. Calendar reads (after calendar ID configured) → then writes (after separate approval)
5. Proactive coaching (briefings already running, need to add action triggers)

---

## 8. Design Principles (from SKILL.md + MEMORY.md)

- **Chat is the control surface, not the database** — SSOTs are Sheets + Calendar
- **Capture is unavoidable** — many inputs → one INBOX → Sunday forcing function
- **Top 3 + calendar = law** — escalation ladder: schedule/delegate/park/kill
- **Proactivity = scheduled briefings + exception-based alerts** (no spam)
- **Safety rails:** backup-before-write, change logs, ask-first for structural edits
- **Contract:** No external write without pre-check → write → read-back → receipt
- **Sterility:** No PII/secrets in repo; CI sanitize gate enforces this
- **Idempotency:** Every write has a dedup key; every action has a receipt
- **Fail-open for capture:** Better to risk a duplicate than lose an item

---

## 9. Key Contacts / Accounts

> PII redacted for CI sanitize gate. Real values in VPS config files (`os_links.yaml`, OpenClaw config).

- **GitHub:** (see VPS config)
- **Firm:** (see VPS config)

---

## 10. Remaining Unknowns

> For Poopsy to fill in during a future VPS session.

```bash
# Full poopsy-in-a-box file tree (excluding .git)
find /data/.openclaw/workspace/projects/poopsy-in-a-box -type f -not -path '*/.git/*' | sort

# Key scripts (cat each to understand)
cat /data/.openclaw/workspace/projects/poopsy-in-a-box/scripts/calendar_spine.mjs
cat /data/.openclaw/workspace/projects/poopsy-in-a-box/scripts/lifeos_drift_watch.mjs
cat /data/.openclaw/workspace/projects/poopsy-in-a-box/scripts/earned_access_gatekeeper.mjs

# Briefing templates
ls /data/.openclaw/workspace/projects/poopsy-in-a-box/briefings/

# Token burn watch
cat /data/.openclaw/workspace/projects/poopsy-in-a-box/state/token_burn_watch.json

# All tabs in Life OS sheet
gog sheets list-tabs <LIFE_OS_SHEET_ID>

# Why is providersHealthy: false?
openclaw status --deep
```

### Blocking checks before intake_router can be adopted
Run these on VPS and paste results:

```bash
# 1. Confirm os_links.yaml has both sheet IDs
cat /data/.openclaw/workspace/os_links.yaml

# 2. List tabs in PRODUCTION sheet
gog sheets list-tabs <PROD_SHEET_ID from os_links.yaml>

# 3. List tabs in SANDBOX sheet
gog sheets list-tabs <SANDBOX_SHEET_ID from os_links.yaml>

# 4. Check sandbox sheet INBOX headers (if the tab exists)
gog sheets get <SANDBOX_SHEET_ID> "INBOX!1:2" --json
```

Once we know which tabs exist in the sandbox sheet, the router can be wired to write there.

### Critical: INBOX header row offset
The **production** INBOX tab has a **title row in row 1** ("📥 Inbox ... Capture quick thoughts here") and **headers in row 2**. This means:
- `lifeos_inbox.mjs` (old) is correct — it hardcodes `INBOX!A2:M` and knows the column order
- `lifeos_inbox_append.mjs` (proposed) reads headers from row 1 — **safe for sandbox sheet** (if no title row), **would break on prod INBOX**
- `dedup_check.mjs` (proposed) reads headers from row 1 — **same: safe for sandbox, not for prod**

**Before promoting intake_router to production**, the modules need a `headerRow` parameter (default 1, set to 2 for prod INBOX) or the prod INBOX title row needs to be removed.

---

*This file is the "boot prompt" for any new Claude session working on this project. Keep it updated.*
