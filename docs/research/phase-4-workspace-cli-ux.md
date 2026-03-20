# Phase 4 Workspace CLI — Interaction Spec

**Date:** 2026-03-20
**Status:** Complete (reviewed — PASS WITH NOTES)
**Purpose:** Define how the CLI workspace should FEEL for the four personas. What they see, what they do, what they learn. Feeds the Architect's Phase 4 brief.
**Design lens:** The CLI is the FIRST surface where the workspace model (ADR-010) becomes real. It must prove the emotional journey works — from cautious hope to compound effect — through a terminal. The web dashboard (Phase 10) will extend this; the CLI must not be throwaway.

---

## The CLI's Job

The CLI is not a management console. It is a **workspace you check in on** — like opening your office in the morning. Rob checks it from his phone terminal at 6:30am. Jordan checks it before their Monday standup. Nadia checks it to see her team's health before a 1:1.

**What the CLI must prove (Phase 4 scope):**
1. Work items can enter naturally (questions, tasks, goals)
2. The system routes them to the right process
3. Human steps pause and resume
4. Three task types surface together (review + action + goal-driven)
5. The system feels alive — it's working when you're not looking

**What the CLI defers (Phase 10):**
- Process graph visualisation
- Streaming generative UI
- Daily Brief as rich content (Phase 4 Brief is text-based, not AI-synthesised)
- Conversation thread as pervasive layer (Phase 4 conversation is command-based)

---

## Design Principles for the CLI

### 1. Verbs, Not Nouns

The user thinks in actions, not entities. Not "manage my work items" but "what needs my attention?" Not "list processes" but "how are things going?"

**Bad:** `agent-os work-item list --status waiting_human`
**Good:** `aos status` — shows everything that matters right now

### 2. The Morning Check-In Pattern

Every persona has a morning ritual. The CLI's primary surface should serve that ritual in under 60 seconds:

| Persona | Morning ritual | What they need from the CLI |
|---------|---------------|----------------------------|
| **Rob** | In the truck, 6:30am, phone | "Any quotes need my eye? Anything stuck?" → 3 items max |
| **Lisa** | Commute, 8:30am, laptop/phone | "Content pipeline status. Any pricing alerts?" → process health + exceptions |
| **Jordan** | Before standup, 9am, desk | "Cross-department status. What to report?" → all processes, grouped |
| **Nadia** | Before 1:1s, varies | "How's Chen's report quality? Whose process needs attention?" → team view |

### 3. Progressive Disclosure in a Terminal

The terminal has no hover states. Progressive disclosure works through:
- **Default output:** Compact, scannable, one screen
- **Flags:** `--detail`, `--all`, `--json` reveal more
- **Drill-down:** Every item has an ID that pipes into the next command
- **Interactive mode:** When TTY, prompts guide; when piped, machine-readable output

### 4. Silence Is the Happy Path

An autonomous process that's running well should produce NOTHING in the morning check-in. No "all good!" messages. No green checkmarks for every process. The absence of an item in the status output IS the signal that things work.

Only surface:
- Items needing human action (review, action, goal tasks)
- Exceptions (degraded process, failed run, low confidence)
- Milestones (trust upgrade suggestion, goal completion)

---

## Command Map: Six Human Jobs in the Terminal

| Human job | CLI command(s) | What it does | Primitives served |
|-----------|---------------|-------------|-------------------|
| **Orient** | `aos status` | Morning check-in: pending tasks + process health + exceptions | Daily Brief, Process Card |
| **Review** | `aos review` | Show items needing review. `aos approve <id>`, `aos edit <id>`, `aos reject <id>` | Review Queue, Output Viewer, Feedback Widget |
| **Define** | `aos start <process>` | Start a process run. `aos sync` to load definitions | Process Builder (future: conversation thread) |
| **Delegate** | `aos trust <process>` | View/adjust trust. `aos trust accept`, `aos trust reject` | Trust Control |
| **Capture** | `aos capture "<text>"` | Quick capture → classified → routed | Quick Capture |
| **Decide** | `aos complete <id>` | Complete a human step. `aos approve <id>` with `--edit` | Improvement Card |

**Root alias:** `aos` (short for Agent OS). Must feel fast.

---

## Scenario 1: Rob's Morning (Orient + Review)

**Context:** Rob is at his kitchen table at 6:30am before heading to site. He checks the CLI on his laptop. (In Phase 10, this becomes the mobile morning brief on his phone. The CLI proves the information architecture; the web dashboard delivers the experience Rob actually wants.)

```
$ aos status

Good morning, Rob.                           Thu 20 Mar

NEEDS YOUR ATTENTION (2)
  #42  Review   Quote: Henderson bathroom reno — $14,200
       Confidence: high │ Process: quoting │ Ready 2h ago
  #43  Action   Confirm site access for 14 Elm St job
       Process: job-scheduling │ Waiting since yesterday

PROCESS HEALTH
  quoting        ● healthy   │ spot-checked │ 34 runs
  follow-up      ● healthy   │ supervised   │ 12 runs
  job-scheduling ⚠ waiting   │ supervised   │ blocked on #43

Nothing else needs you right now.
```

**What Rob does:**

```
$ aos review #42

Quote: Henderson Bathroom Renovation
──────────────────────────────────────
Customer:    Henderson, 14 Elm St
Type:        Residential bathroom reno
Confidence:  high

  Materials                          $6,200
    ├─ Tiles (60m² @ $45)           $2,700
    ├─ Fixtures (Rinnai HW, vanity) $2,100
    ├─ Plumbing supplies            $1,400
  Labour                             $5,600
    ├─ 2 plumbers × 3.5 days       $4,900
    ├─ Tiler × 1.5 days              $700
  Margin (25%)                       $2,400
  ──────────────────────────────────────
  Total                            $14,200

Checks passed: pricing ✓ margin ✓ labour estimate ✓
Flagged: none

[a]pprove  [e]dit  [r]eject  [s]kip
```

Rob hits `a`. Quote is sent. 30 seconds.

```
$ aos complete #43 --note "Access confirmed with tenant, side gate code 4821"

✓ Job scheduling process resumed with your input.
```

Rob's morning is done. Two items, under 2 minutes, from his truck.

---

## Scenario 2: Jordan's Cross-Department View (Orient)

**Context:** Jordan is at their desk, 9am Monday, before the leadership standup.

```
$ aos status --all

Good morning, Jordan.                        Mon 17 Mar

NEEDS YOUR ATTENTION (3)
  #87  Review   HR reference check summary — Chen Wei
       Process: hr-reference │ Ready 14h ago
  #88  Action   Approve budget allocation for Q2 analysis
       Process: finance-recon │ Waiting 2 days
  #89  Goal     "Automate month-end" — 2 of 5 tasks complete
       Process: orchestrator │ Next: reconciliation template

RUNNING QUIETLY
  expense-reports    12 runs │ 0 exceptions │ autonomous
  weekly-report      4 runs  │ 0 exceptions │ spot-checked

PROCESS HEALTH
  hr-reference     ● healthy   │ supervised   │  8 runs
  finance-recon    ● healthy   │ supervised   │ 22 runs
  expense-reports  ● healthy   │ autonomous   │ 47 runs
  weekly-report    ● healthy   │ spot-checked │ 16 runs

TRUST CHANGES
  expense-reports: upgrade to autonomous accepted 3 days ago ✓
```

Jordan copies the status output for the leadership meeting. The `--json` flag gives them structured data for a slide.

---

## Scenario 3: Capturing Work (Capture)

**Context:** Rob is on a job site. A customer mentions wanting a hot water quote.

```
$ aos capture "Henderson also wants HW quote, Rinnai system, access is tight"

✓ Captured as task
  Classified: quote request (quoting process)
  Routed to: quoting
  Work item: #44

The quoting process will draft this. You'll see it in your review queue.
```

The system classified the capture, routed it, and told Rob what will happen. Rob doesn't think about it again.

**Interaction states for capture:**

| State | What the user sees |
|-------|-------------------|
| **Success** | Classification + routing + work item ID + what happens next |
| **Ambiguous** | "This could be a quote request or a support issue. Which feels right?" + interactive select |
| **No matching process** | "I don't have a process for this yet. Saved as a task — you can define a process for it later." |
| **Error** | "Couldn't classify this. Saved as unclassified task #44. Check `aos review #44`." |

---

## Scenario 4: Human Step in a Process (Action task)

**Context:** Lisa's compliance checking process reaches a step that requires a human to verify a supplier certificate is current.

```
$ aos status

NEEDS YOUR ATTENTION (1)
  #61  Action   Verify supplier certificate for GreenPack Ltd
       Process: compliance-check │ Step 3 of 5 │ Waiting since 2h ago

       Instructions: Check that GreenPack's ISO 14001 certificate
       is current (not expired). The certificate is attached to
       their last email (March 12).

       When done: enter expiry date and status
```

```
$ aos complete #61

Completing: Verify supplier certificate for GreenPack Ltd

? Certificate status
  ● Current
  ○ Expired
  ○ Not found

? Expiry date: 2027-06-15

? Any notes? (optional): Verified via email attachment, cert #GPI-2027-443

✓ Compliance check process resumed with your input.
  Step 4 (risk assessment) now running.
```

The interactive prompts are driven by the `input_fields` from the process definition's human step. When not TTY (piped/scripted), accepts `--data` JSON flag.

---

## Scenario 5: Nadia's Team View (Orient + Delegate)

**Context:** Nadia wants to check how her team's processes are performing before her weekly 1:1 with Chen.

```
$ aos status --process report-formatting

report-formatting                    spot-checked │ 23 runs
──────────────────────────────────────────────────────────
Trust:        spot-checked (earned after 20 supervised runs)
Last 10 runs: 9 approved, 1 corrected (formatting header)
Correction trend: ▼ decreasing (3→1→0→1 over 4 weeks)
Quality:      all criteria met
Cost:         $0.82 avg per run

Recent corrections:
  Run #21: Header formatting — "Executive Summary" was bold, should be regular

Suggestion: none pending

$ aos trust report-formatting

Trust tier: spot-checked
  Upgrade eligibility: 3 more clean runs to qualify for autonomous suggestion
  Downgrade triggers: none active

  Last 20 runs:
    Approved clean:  17 (85%)
    Corrected:        3 (15%)
    Rejected:         0 (0%)

  Grace period: not active
```

Nadia sees Chen's process is healthy. The one correction was minor. She can focus the 1:1 on development, not fixing the same formatting issue again.

---

## Interaction States (All Commands)

### `aos status`

| State | What the user sees |
|-------|-------------------|
| **Normal** | Pending tasks + process health + running quietly section |
| **Empty (nothing pending)** | "Nothing needs your attention right now. All N processes running normally." — One line. Not a dashboard of green checkmarks. |
| **No processes** | "No processes set up yet. Run `aos sync` to load process definitions, or `aos capture` to start entering work." |
| **Error (DB)** | "Couldn't connect to the database. Run `aos sync` to initialize." |
| **First run** | "Welcome to Agent OS. Run `aos sync` to get started." |
| **Confidence escalation (ADR-011)** | An autonomous process produced a low-confidence output → it appears in NEEDS YOUR ATTENTION despite the process normally running quietly: `#55 Review Invoice match uncertain — GreenPack $4,200 vs PO $3,800 / Confidence: low │ Process: invoice-recon (autonomous) │ Escalated: agent flagged uncertainty` |

### `aos review`

| State | What the user sees |
|-------|-------------------|
| **Items pending** | List of items with ID, type (review/action/goal), summary, process, age |
| **Empty queue** | "Review queue is empty. Nice." |
| **Review detail** | Full output with checks passed/failed, confidence, approve/edit/reject actions |
| **After approve** | "✓ Approved. [Process name] continuing." |
| **After edit** | Opens $EDITOR (existing pattern). On save: "✓ Approved with edits. Diff captured as feedback." |
| **After reject** | "Why are you rejecting this? (required)" → text input → "✓ Rejected. Reason recorded. [Process name] will retry with feedback." |

### `aos capture`

| State | What the user sees |
|-------|-------------------|
| **Success** | Classification + routing + work item ID + what happens next |
| **Ambiguous classification** | Interactive select between 2-3 options (TTY) or first-match (pipe) |
| **No matching process** | Saved as unclassified task, user told to define process later |
| **Intake-classifier at supervised tier** | "Classified as [type] → routed to [process]. (Classification is supervised — you'll build confidence in routing over time.)" |

### `aos complete <id>`

| State | What the user sees |
|-------|-------------------|
| **Interactive (TTY)** | Prompts driven by human step's `input_fields`. Select, text, date inputs via @clack/prompts |
| **Scripted (pipe)** | Accepts `--data '{"field": "value"}'` JSON |
| **Wrong ID** | "Work item #N is not a human step waiting for completion." |
| **Already completed** | "Work item #N was already completed." |
| **Timeout approaching** | "This step has been waiting 3 days. The process will escalate in 24 hours." |

### `aos trust <process>`

| State | What the user sees |
|-------|-------------------|
| **Current state** | Trust tier, recent metrics, correction trend, upgrade eligibility, downgrade triggers |
| **Upgrade suggestion** | "The system suggests upgrading to [tier]. Evidence: [metrics]. `aos trust accept` or `aos trust reject`" |
| **After accept** | "✓ [Process] upgraded to [tier]. Grace period active (5 runs, safety valve at 50%)." |
| **Downgrade occurred** | "⚠ [Process] downgraded to supervised. Trigger: [reason]. Override with `aos trust override`." |

---

## Output Formatting Principles

### Scannable, Not Verbose

Every output follows the newspaper pattern: headline first, detail on demand.

```
# Bad — wall of text
Work item #42 of type "review" is ready for your attention. It was created by
the quoting process at 2026-03-20T04:32:00Z and has a confidence level of
"high". The process has been running for 34 iterations...

# Good — headline + structure
#42  Review   Quote: Henderson bathroom reno — $14,200
     Confidence: high │ Process: quoting │ Ready 2h ago
```

### Consistent Item Format

Every work item in any listing follows the same structure:
```
#ID  Type     Summary
     Context │ Process │ Age
```

Type uses a fixed vocabulary: `Review`, `Action`, `Goal`, `Insight`, `Question`.

### Machine-Readable Output

Every command supports `--json` for scripting and `--quiet` for minimal output (just IDs).

```
$ aos status --json | jq '.pending[].id'
42
43

$ aos approve 42 --quiet
42
```

---

## What This Spec Does NOT Cover

These are deferred to Phase 10 (web dashboard) or later:

1. **Process graph visualisation** — needs canvas, not terminal
2. **Daily Brief as AI-synthesised narrative** — Phase 4 brief is structured text from data, not generated prose. The AI synthesis comes when the brief-synthesizer system agent is built (Phase 10).
3. **Conversation as pervasive layer** — Phase 4 capture is a single command, not a chat thread. Full conversation thread is Phase 10.
4. **Streaming generative UI** — no streaming in terminal; results appear when ready
5. **Team view** — Nadia's cross-team view (seeing ALL team members' processes at a glance) is shown via `--process` flag one-at-a-time, not a dedicated team command. Full team portfolio view is Phase 10. **Persona impact:** Nadia can inspect individual processes but can't get the "glance across my whole team" view until the web dashboard.
6. **Process Builder** — process definitions are YAML files loaded via `aos sync`. Conversational process building is Phase 10.
7. **"Teach this" pattern detection** — When the user corrects the same issue repeatedly, the system should surface "You consistently fix X — teach this?" This is the Week 2-3 emotional moment (Building Confidence). In Phase 4, edits ARE captured as feedback and diffs are stored (existing harness). But the pattern-detection-and-surfacing UX is deferred. **Architect decision needed:** should Phase 4 include a minimal "pattern detected" notification after `aos edit` (e.g., "This is the 3rd time you've corrected margin calculations. Run `aos teach` to make it permanent.")? This is the moment the user feels *heard*. Without it, the emotional journey has a gap between Week 1 (cautious hope) and Month 1 (trust forming).
8. **Improvement Cards** — Process degradation alerts and improvement proposals (Primitive 13) are deferred to Phase 8 (where ADR-011 places health alerts). In Phase 4, the user sees process health in `aos status` but not proactive improvement suggestions.

---

## Process Architecture Notes (L1)

The CLI commands must not leak implementation details. The user never sees:
- "work item" (they see tasks, reviews, actions)
- "intake-classifier" (they see "classified as...")
- "router" (they see "routed to [process name]")
- "harness pipeline" (they see "checks passed/failed")
- "trust gate" (they see "confidence: high" and trust tier name)

The user's mental model is: "I tell the system what I need. It figures out where it goes. It does the work. It asks me when it needs my help. I can see how things are going."

---

## UX Patterns from Other Products (Sources)

| Pattern | Source | How it applies |
|---------|--------|----------------|
| Morning dashboard with parallel load | GitHub CLI `gh status` | `aos status` aggregates heterogeneous items in one view |
| Entity-segregated + aggregation layer | GitHub CLI command structure | `review`, `capture`, `trust` as entity commands; `status` as aggregation |
| Interactive with graceful fallback | Linear CLI `issue start` | Accept ID arg OR prompt if TTY, error if piped without ID |
| Multi-step interactive workflows | @clack/prompts `group()` | `aos complete` driven by process step's `input_fields` |
| Searchable selection for large lists | @clack/prompts `autocomplete` | Process selection when ambiguous |
| Context-aware defaults | Linear CLI branch detection | Future: detect workspace context from directory/env |
| Format polymorphism | GitHub CLI `Exporter` | `--json` on every command |
| Silence as success | Unix philosophy | Empty output = nothing needs attention |

---

## Gaps: Original to Agent OS

1. **Unified heterogeneous task surface in CLI** — No CLI surveyed shows review outputs, human action steps, and goal-decomposed tasks in the same listing. GitHub CLI comes closest with `gh status` but doesn't mix entity types in the action queue.

2. **Trust progression visible in CLI** — No CLI shows earned trust data, upgrade suggestions, or downgrade history. This is the "trust without blind faith" job.

3. **Capture → classify → route in CLI** — No CLI does intake classification + process routing from a single capture command. Everything surveyed requires the user to know which command/entity to target.

4. **Human step completion with dynamic input fields** — No CLI generates interactive prompts from a process definition's step schema. The closest is GitHub CLI's `gh pr create` interactive mode, but that's hardcoded, not schema-driven.
