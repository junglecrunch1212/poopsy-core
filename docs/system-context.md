# System Context — Poopsy-in-a-Box / poopsy-core

> **Purpose:** Single "boot me up" doc for any new Claude session. Read this first, ask questions second.
> **Last updated:** 2026-02-10 by Claude Code session
> **Maintainer:** Poopsy should update this during heartbeats when things change.

---

## 1. Who's Who

- **Human:** James ("Bossman"), 43, Atlanta GA (Grant Park → Virginia-Highland move in progress)
- **Agent:** Poopsy 💩 (private) / Mr. Whoops (public) — AI household Chief of Staff
- **Platform:** OpenClaw (open-source AI assistant, formerly Clawdbot/Moltbot), self-hosted
- **Goal:** Better-than-human Household Chief of Staff — proactive executive assistant + ADHD/health execution coach for two co-heads of household (James + Laura)

### James quick facts
- INFP with ADHD — proactive check-ins, break down overwhelm, capture immediately, celebrate wins
- CFO/CTO/COO at Evolve Family Law (~10 hrs/week), Laura is junior partner
- Son Henry (6), baby girl (Mary Holland) arriving May 2026, planning third child ~18mo after
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
| Gmail (via `gog`) | **Read-only working** | `gog gmail list/read` works. Triage cron runs every 2h (08:00–20:00 ET). GOG_ACCOUNT=jrstice@gmail.com. |
| Google Calendar | **Read working, writes gated** | `gog calendar list` works. No write scripts exist yet. `calendar_spine.mjs` may exist in poopsy-in-a-box. |
| Google Sheets | **Read working, writes gated** | Reads from Life OS INBOX + _MASTER_LOG work. Live writes are gated; sandbox writes approved. `_PROBE_LOG` approved as safe write sink in LIVE sheet. |
| Tailscale | **Working** | VPS + PC + iPhone connected |

### Key policy: Write gates
- **Reads:** OK everywhere, no approval needed
- **Sandbox writes:** OK (INBOX_SANDBOX tab, _PROBE_LOG tab)
- **Live writes:** Require explicit Bossman approval + idempotency + readback verification
- **Calendar writes:** Not yet enabled, intentionally guarded (anti-nag posture)
- **Email sends:** Never without asking first

---

## 3. The Two Repos

### poopsy-core (this repo — sterile skill skeleton)
- **GitHub:** `junglecrunch1212/poopsy-core`
- **Purpose:** Minimal, portable core loop. The clean "spine" — no PII, no real IDs committed.
- **Pattern:** observe → decide → act → learn
- **Contract:** No external writes without pre-check → write → read-back → receipt

#### Scripts
| Script | What it does |
|---|---|
| `observe.mjs` | Read top 3 scored tasks from _MASTER_LOG → `state/signals.json` |
| `decide.mjs` | Pick top 1 from signals → `state/decisions.json` |
| `capture.mjs` | Append task to INBOX (action=task), mark processed (action=processed), promote (action=promote) |
| `intake_router.mjs` | **NEW** — Deterministic classifier + router. WhatsApp/Gmail/calendar/manual → classify → dedup → append to INBOX_SANDBOX → readback → receipt |
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
| `lifeos_inbox_append.mjs` | **NEW** — Header-driven, tab-configurable append. Works with any INBOX-shaped tab. Used by `intake_router.mjs`. |
| `lifeos_masterlog.mjs` | _MASTER_LOG append with header-driven column map. `appendMasterLogRow(fields)` + `getMasterLogHeaderMap()`. |
| `header_map.mjs` | `buildHeaderMap(headers, { required, aliases })` — resilient column resolution by normalized name. |
| `idempotency.mjs` | `idempotencyKey({ kind, person, text, sourceId })` — SHA256 first 16 chars. |
| `dedup_check.mjs` | **NEW** — `isDuplicate(idemKey, { sheetId, tab, maxScan })` — header-driven scan of Ref column for existing `idem:<key>`. |
| `action_ledger.mjs` | Append-only JSONL receipt log. `append(entry)` → `data/ledger/action-ledger.jsonl`. |

#### Config (sterile templates — real values in live override path)
- `config/connections.yaml` — Sheet IDs (`__PENDING__`), Calendar IDs (`__PENDING__`), tab names
- `config/household.yaml` — Household name, timezone, agent_name, people

#### CI
- `.github/workflows/ci.yml` — Node 22, runs `npm test` + `npm run sanitize`
- `scripts/sanitize_check.sh` — Blocks commits containing tokens, API keys, Google Sheets URLs, real emails

### poopsy-in-a-box (on VPS — the full automation project)
- **GitHub:** `junglecrunch1212/poopsy-in-a-box`
- **Purpose:** Full household Chief of Staff project — skills, modules, policies, research, briefings
- **Location on VPS:** `/data/.openclaw/workspace/projects/poopsy-in-a-box/`

#### [UNKNOWN — Poopsy should fill these in from VPS]
- [ ] Full file tree (`ls -R` or similar)
- [ ] `STATUS.md` contents
- [ ] `ROADMAP.md` contents
- [ ] `modules.json` / module registry
- [ ] `scripts/calendar_spine.mjs` — what it does, current state
- [ ] `scripts/lifeos_drift_watch.mjs` — what it does, current state
- [ ] `scripts/lifeos_diff.mjs` — what it does
- [ ] `scripts/earned_access_gatekeeper.mjs` — current logic
- [ ] `scripts/build_lock.sh` — locking mechanism
- [ ] `scripts/repo_coherence_audit.mjs` — what it checks
- [ ] `scripts/rebuild_doc_check.mjs` — what it checks
- [ ] `scripts/skill_security_audit.mjs` — audit logic
- [ ] `scripts/probe_modules.mjs` — what modules it probes
- [ ] `inbox_rules.yaml` — triage policy for Gmail
- [ ] `briefings/` — template structure, suppressions.yaml
- [ ] `research/loops/` — any loop definitions
- [ ] `workspace-template/modules.json` — module definitions including _PROBE_LOG references
- [ ] `state/loop_state.json` — current structure
- [ ] `state/earned_access.json` — current state/schema
- [ ] `state/token_burn_watch.json` — current snapshot
- [ ] Any other scripts/policies not listed above

---

## 4. Google Sheets — Life OS

### Sheet URLs
- Life OS: `https://docs.google.com/spreadsheets/d/1cbi7AjRbyKrk9N84RhyDQ5HpAl96oIVXGhjh8ttIwf8/edit`
- Financial OS: `https://docs.google.com/spreadsheets/d/1K8qYja-kIAIuDXfZ9391gDyHNIIv6Aiz/edit`

### [UNKNOWN — actual Sheet IDs from live connections.yaml]
- [ ] `life_os.sheet_id`: _________
- [ ] `financial_os.sheet_id`: _________
- [ ] `family_ssot.calendar_id`: _________
- [ ] `holds.calendar_id`: _________

### INBOX tab schema (row 1 = headers, row 2+ = data)
| Col | Header | Description |
|---|---|---|
| A | ID | `INB-YYYYMMDD-XXXX` (auto-generated) |
| B | When | ISO timestamp |
| C | From | Source (e.g. `whatsapp:James`, `capture:james`) |
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
Required columns: `item_id`, `title`, `owner`, `status`, `created_at`, `source_system`, `source_ref`, `inbox_id`

Full column set (from `appendMasterLogRow`): `item_id`, `item_type`, `title`, `description`, `domain`, `subdomain`, `owner`, `status`, `priority`, `effort_minutes`, `due_date`, `created_at`, `created_by`, `updated_at`, `updated_by`, `source_system`, `source_ref`, `inbox_id`

Range: A:AT (columns may extend beyond the above)

### [UNKNOWN — actual current header rows from the live sheets]
- [ ] INBOX actual headers (verify against schema above)
- [ ] _MASTER_LOG actual headers (full list)
- [ ] INBOX_SANDBOX tab — does it exist yet? Headers?
- [ ] _PROBE_LOG tab — does it exist? Headers?
- [ ] Dashboard tab structure (James/Laura/Next Top 3 views)
- [ ] Gamification system details (XP, levels, streaks)

### Tab inventory
| Tab | Purpose | Write policy |
|---|---|---|
| INBOX | Live capture inbox | Gated (approval required) |
| INBOX_SANDBOX | Sandbox for testing intake router | Safe to write |
| _MASTER_LOG | Promoted tasks, full metadata | Gated |
| _PROBE_LOG | Probe/diagnostic sink | Safe to write (approved) |
| Dashboard | James/Laura/Next Top 3 views | Read-only from scripts |
| [UNKNOWN] | _Other tabs?_ | _Fill in_ |

---

## 5. OpenClaw Agent Files

All live at the workspace root on VPS. Key files:

| File | Purpose |
|---|---|
| `AGENTS.md` | Session boot protocol: read SOUL.md → USER.md → memory → MEMORY.md |
| `SOUL.md` | Personality, boundaries, coach mode, earned access rules |
| `USER.md` | Everything about James — role, family, priorities, health, ADHD, preferences |
| `IDENTITY.md` | Name (Poopsy/Mr. Whoops), creature type, vibe, emoji |
| `TOOLS.md` | Local infra notes (cameras, SSH, TTS, contacts) |
| `MEMORY.md` | Curated long-term memory (big vision, infra status, lessons, active projects) |
| `HEARTBEAT.md` | Briefing quality improvement loop (micro-fix, noise audit, reliability check) |
| `memory/YYYY-MM-DD.md` | Daily raw logs |
| `memory/heartbeat-state.json` | Last check timestamps for email/calendar/weather/mentions |

### Earned Access system
- James must complete 4 daily pillars: Exercise, Captain (dog training), Honey-Do (1 concrete item), House Reset
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
| Emerald City Locks bagel reminder | One-shot 2026-05-27 09:00 | main/system | Laura's bagel the day after Mary Holland is born |

### Currently DISABLED
| Job | Notes |
|---|---|
| 5pm Earned Access webchat check-ins (10:00, 13:00, 15:30, 16:30, 16:50) | Disabled — were chattiest token burners |
| 5pm Earned Access WhatsApp check-ins (10:00, 13:00, 15:30, 16:30, 16:50) | Disabled — same |
| Module probes (daily) | Disabled by default in template |
| Various one-shot reminders (daycare waitlists, proactive Poopsy, exercise starter) | Fired and disabled |

---

## 7. The Big Picture — What's Working vs. What's Missing

### Working
- OpenClaw running + WhatsApp connected + messages flowing
- Gmail read/triage every 2h
- Google Calendar reads
- Google Sheets reads (INBOX + _MASTER_LOG)
- poopsy-core INBOX append + promote pipeline + receipts + ledger
- 25+ enabled cron jobs (briefings, earned access, build sprint, drift watch, intel)
- Sandbox write policy established

### The critical gap: No unified intake router
The system can **read** from all sources (Gmail, Calendar, WhatsApp) and **write** to Sheets (with safety), but there's no pipe connecting them:

```
Gmail triage output ──┐
                      │   intake_router.mjs (NEW, just shipped)
WhatsApp messages ────┤──────────────────────────────→ INBOX_SANDBOX
                      │                                (then INBOX after approval)
Calendar invites ─────┘
```

**`intake_router.mjs`** was just added to poopsy-core to fill this gap. It does:
1. Classify inbound text (task / calendar_candidate / list / capture-needs-triage)
2. Dedup check against existing INBOX rows via idempotency key
3. Append to INBOX_SANDBOX (sandbox-first, no prod writes)
4. Readback verification
5. Receipt to action ledger

### Remaining work to reach "Chief of Staff"
1. **Create INBOX_SANDBOX tab** in Life OS sheet (matching INBOX headers)
2. **Wire intake_router into existing crons** — Gmail triage → intake_router, WhatsApp on-message → intake_router
3. **Calendar write scripts** — `gog calendar create` for tasks with due dates (gated)
4. **Heartbeat/cron for proactive coaching** — morning digest, transition warnings, nudges
5. **Promotion to live** — after sandbox is proven, Bossman approves removing `--sandbox` flag
6. **on-message hook** — implement the WIP `hooks/on-message.md` contract

### Staged rollout
1. Sandbox INBOX writes (current) → readback proof → verify dedup works
2. Live INBOX writes (after approval) → same safety guarantees
3. Calendar writes (after separate approval) → existence check + idempotency
4. Proactive coaching (briefings already running, need to add action triggers)

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

- **James WhatsApp:** +14048495800
- **Gmail (gog):** jrstice@gmail.com
- **GitHub:** junglecrunch1212
- **Firm:** Evolve Family Law (Dawn Smith founding partner, Laura junior partner)

---

## 10. [UNKNOWN — Poopsy: please fill these in]

> Run these on VPS and paste output into this section, then commit.

```bash
# Installed skills
openclaw skill list

# gog auth status / scopes
gog auth status

# Live connections (redact sheet IDs to last 6 chars if worried about repo leak)
cat /data/.openclaw/workspace/poopsy-core-live/connections.yaml

# poopsy-in-a-box file tree
find /data/.openclaw/workspace/projects/poopsy-in-a-box -type f | head -100

# Current loop state
cat /data/.openclaw/workspace/projects/poopsy-in-a-box/state/loop_state.json

# Earned access state
cat /data/.openclaw/workspace/projects/poopsy-in-a-box/state/earned_access.json

# ROADMAP
cat /data/.openclaw/workspace/projects/poopsy-in-a-box/ROADMAP.md

# STATUS
cat /data/.openclaw/workspace/projects/poopsy-in-a-box/STATUS.md

# Module registry
cat /data/.openclaw/workspace/projects/poopsy-in-a-box/workspace-template/modules.json

# Inbox rules
cat /data/.openclaw/workspace/inbox_rules.yaml

# INBOX actual headers (row 1)
gog sheets get <LIFE_OS_SHEET_ID> "INBOX!1:1" --json

# _MASTER_LOG actual headers (row 1)
gog sheets get <LIFE_OS_SHEET_ID> "_MASTER_LOG!1:1" --json

# Does INBOX_SANDBOX exist?
gog sheets get <LIFE_OS_SHEET_ID> "INBOX_SANDBOX!1:1" --json

# Does _PROBE_LOG exist?
gog sheets get <LIFE_OS_SHEET_ID> "_PROBE_LOG!1:1" --json
```

---

*This file is the "boot prompt" for any new Claude session working on this project. Keep it updated.*
