# Ditto — Prototype Plan

**Date:** 2026-03-24
**Status:** Active — prototyping is a first-class process (Insight-084)
**Gate:** All core journey prototypes must be approved before Phase 10 build brief is finalised

---

## Purpose

These prototypes ARE the design. Not illustrations, not wireframes — the actual pixel-level visual target that the Builder works from. Each is a self-contained HTML file that can be opened in any browser, walked through by a real person, and stress-tested against personas.

Every prototype must pass the Rob test: "Would Rob use this on his phone between jobs?" And the Libby test: "Would Libby understand what's happening without anyone explaining it?"

---

## The Journey

Prototypes are sequenced along the user's emotional arc from personas.md. Each covers a specific moment that matters. Together they tell the complete story of using Ditto from day zero through months of use.

### Act 1: Getting Started (Week 0)

The user goes from "what is this?" to "this thing understands me and has a plan."

| # | Prototype | Moment | Primary persona | Key design question | Status |
|---|-----------|--------|----------------|-------------------|--------|
| P08 | `08-day-zero.html` | First screen. Nothing exists yet. | Libby | Does this feel inviting without being generic? Does it avoid every "AI tool" cliché? | **Draft v1** |
| P09 | `09-first-conversation.html` | First 10 minutes. Intake → structure emerges → plan proposed. | Libby | Does knowledge capture feel visible? Does the user know where they are? Does the process proposal feel earned, not scripted? | **Draft v1** |
| P10 | `10-first-output.html` | Ditto produces something for the first time. | Libby | **THE trust moment.** Can the user see what knowledge went into this output? Can they edit it and feel heard? Does it feel like THEIR voice, not generic AI? | **Draft v1** |
| P11 | `11-workspace-emerges.html` | After first output, the home screen has structure. | Libby | How does the workspace appear without overwhelming? How does it feel different from a dashboard? | **Draft v1** |

**Act 1 proves:** Ditto is not ChatGPT. Within 15 minutes, the user has structured knowledge captured, a plan, and a first output — and they can SEE the connection between what they said and what was produced.

### Act 2: Building Confidence (Week 1-3)

The user goes from "let me check everything" to "this is getting things right."

| # | Prototype | Moment | Primary persona | Key design question | Status |
|---|-----------|--------|----------------|-------------------|--------|
| P12 | `12-morning-mobile.html` | Rob's morning. Phone. Coffee. 3 minutes. | Rob | Can Rob review a quote, approve it, and be done — all on a 375px screen? Does the morning brief feel like a competent colleague, not a notification dump? | **Draft v1** |
| P13 | `13-daily-workspace.html` | The daily driver. Desktop. Multiple processes. | Rob / Lisa | Does this feel like a calm workspace, not a dashboard? Is the priority clear? Can the user act without hunting? | **Draft v1** |
| P14 | `14-process-detail.html` | Drilling into one process. | Rob | Can a non-technical person understand how the process works, how it's performing, and what trust level means — without jargon? | **Draft v1** |
| P15 | `15-knowledge-base.html` | "What does Ditto know about me?" Full knowledge view. | Libby / Lisa | Can the user browse, edit, and see connections? Does this feel like a living document, not a settings page? | **Draft v1** |

**Act 2 proves:** The user feels in control. They can see what's happening, act on what matters, and trust that Ditto knows what it knows. The workspace is calm, not noisy.

### Act 3: Trust Forming (Month 1-2)

The user goes from "I check everything" to "I check exceptions."

| # | Prototype | Moment | Primary persona | Key design question | Status |
|---|-----------|--------|----------------|-------------------|--------|
| P16 | `16-teach-this.html` | User corrects an output. Ditto spots the pattern. "Teach this?" | Rob | Does this feel natural, not like a feedback form? Does the user understand what "teach this" means without explanation? | **Draft v1** |
| P17 | `17-trust-upgrade.html` | "Your quoting has been solid. Want me to send routine ones automatically?" | Rob | Does the evidence feel trustworthy? Does the user feel in control of the decision? Does it feel earned, not pushy? | **Draft v1** |
| P18 | `18-second-process.html` | Adding a second process. The compound effect begins. | Rob / Jordan | How does the workspace grow without becoming cluttered? Does shared knowledge flow naturally between processes? | **Draft v1** |

**Act 3 proves:** The system learns from the user's corrections, earns trust with evidence, and expands naturally. The user feels like they're managing a growing team, not configuring a growing system.

### Act 4: The Compound Effect (Month 3+)

The user goes from "this handles my quoting" to "this runs my operations."

| # | Prototype | Moment | Primary persona | Key design question | Status |
|---|-----------|--------|----------------|-------------------|--------|
| P19 | `19-multi-process-workspace.html` | 4+ processes running. The full workspace. | Jordan / Nadia | Does this still feel simple with multiple processes? Does the process graph help, not overwhelm? Does Nadia see her team, not just her own work? | **Draft v1** |
| P20 | `20-something-wrong.html` | A process degrades. Trust auto-downgrades. Ditto surfaces it. | Rob / Nadia | Does the user feel informed, not alarmed? Is the degradation explanation clear? Does the recovery path feel obvious? | **Draft v1** |

**Act 4 proves:** Ditto scales from one process to many without losing simplicity. Problems surface calmly. The user manages exceptions, not operations.

---

## Cross-Cutting Prototypes

These aren't journey moments — they're variants that must work across all moments.

| # | Prototype | What it covers | Status |
|---|-----------|---------------|--------|
| P21 | `21-mobile-workspace.html` | The workspace on a phone. Feed, review queue, quick capture. How does the three-panel collapse? | **Not started** |
| P22 | `22-knowledge-in-output.html` | Close-up: an output with its "based on" provenance visible. The trust mechanism in detail. | **Not started** |

---

## Existing Prototypes — Disposition

| File | What it is | Decision |
|------|-----------|----------|
| `01-conversation-surface.html` | Rob's morning brief in conversation mode | **Keep as reference** — good conversation primitives, but superseded by P12 for mobile morning |
| `02-workspace-feed.html` | Three-panel workspace | **Keep as reference** — good structure, but P13 refines it with knowledge visibility |
| `03-process-detail.html` | Process detail view | **Rework into P14** — good bones, needs knowledge connections and simpler language |
| `04-onboarding.html` | Onboarding v1 (pure chat) | **Archive** — superseded by P09 |
| `04-onboarding-v2.html` | Onboarding v2 (structured intake) | **Archive** — merged into P09 |
| `05-strategy-session.html` | Dual-pane brand strategy | **Keep as reference** — good dual-pane pattern, may inform P10 |
| `06-knowledge-capture.html` | Knowledge building with synthesis | **Keep as reference** — good components (synthesis card, health card), feeds P15 |
| `07-guided-unfolding.html` | Input cards with guided flow | **Keep as reference** — input card components used in P09 |

---

## Sequencing

Build order is driven by dependency and user journey:

**Sprint 1: The Foundation**
1. P08 — Day zero *(draft v1 exists, needs review)*
2. P09 — First conversation *(draft v1 exists, needs review)*
3. P10 — First output *(THE critical prototype — if this doesn't work, nothing else matters)*
4. P22 — Knowledge-in-output close-up *(supports P10)*

**Sprint 2: The Daily Driver**
5. P12 — Morning mobile *(Rob's core experience)*
6. P13 — Daily workspace *(desktop daily driver)*
7. P14 — Process detail *(rework of 03)*

**Sprint 3: Growth & Trust**
8. P15 — Knowledge base browser
9. P16 — Teach this
10. P17 — Trust upgrade
11. P11 — Workspace emerges *(needs P13 as reference for what it's growing toward)*

**Sprint 4: Scale**
12. P18 — Second process
13. P19 — Multi-process workspace
14. P20 — Something went wrong
15. P21 — Mobile workspace

---

## Real-World Test Cases (use as prototype content)

These are real businesses to test against. Use their actual workflows as prototype content instead of abstract "Rob's quote."

### Content & Brand Voice
**Steven Leckie (Real Estate, Dubai)** — Drops a developer PDF brochure, gets a content pack (listing description, 3 Instagram captions, video script, email blast). Weekly social batch (5 posts queued Sunday). Agent listing review against brand standards. Ad copy variants with performance feedback loop.
**Best for:** P10 (first output — content pack from PDF drop), P13 (daily workspace — content review queue), P16 (teach this — voice corrections)

### Professional Services / Expertise Capture
**Rawlinsons (Quantity Surveyors)** — Upload plans → cost estimate with flagged assumptions. Senior QS judgment about when rates are unrealistic. Corrections to rate estimates = implicit feedback. Quarterly rate review. Benchmark comparisons.
**Best for:** P10 (first output — cost estimate with confidence levels), P15 (knowledge base — accumulated rate judgment), P16 (teach this — rate adjustments as learning)

### Compliance & Structured Decision-Making
**Delta Insurance (Underwriting)** — Broker submissions in inconsistent formats → triage (decline/flag/quote). Quote preparation with pricing model. Claims handling. Monthly bordereaux to Lloyd's (autonomous, mechanical). Regulatory compliance checks (never fully autonomous).
**Best for:** P12 (morning brief — submission queue), P13 (daily workspace — underwriter's desk), P17 (trust upgrade — bordereaux earning autonomy), P20 (something wrong — compliance flag)

### Case Management & Deadlines
**FICO Capital Solutions (Golden Visa, Dubai)** — Client onboarding generates document checklist. Document collection with automated chasing. Application package assembly. Weekly client status updates (some want detail, some want brevity). Regulatory change impact across active cases.
**Best for:** P13 (daily workspace — case manager's view), P19 (multi-process — multiple concurrent cases), P11 (workspace emerges — first client case)

### Manufacturing & ERP Integration
**Abodo Wood (Timber)** — Enquiry from architect → qualify → select products → calculate quantities → check stock → produce quote. Plan quantity takeoff from architect drawings. Order-to-production handoff via Epicor ERP.
**Best for:** P10 (first output — quote from plans), P14 (process detail — the quoting process with ERP integration)

### Clinical Practice & Methodology
**Jay / Status (Longevity Practice)** — Voice note after consultation → structured session notes. Treatment plan generation from assessment. Patient progress summaries before sessions. Methodology documentation (capturing what lives in his head). Content from clinical work (clinical → public-facing). Outcome tracking across patient cohort.
**Best for:** P09 (first conversation — methodology capture), P10 (first output — session notes from voice), P15 (knowledge base — clinical methodology), P22 (knowledge-in-output — "based on" provenance for treatment plans)

### Solo Operator Building a Business
**Libby (Doula → Education)** — Brand voice definition, persona development, social content, survey synthesis, course development. Knowledge accumulation over time. Also: mum life workspace (meal planning, schedules).
**Best for:** P08 (day zero), P09 (first conversation), P15 (knowledge base — brand knowledge growing)

### Multi-Context Freelancer
**Tim (Fractional CTO)** — Multiple clients each with own context/voice/knowledge. Cross-workspace morning brief. Clean context switching. Also: family workspace, micro-school project.
**Best for:** P13 (daily workspace — multi-client view), P19 (multi-process — cross-workspace)

### What These Cases Reveal

Every case follows the same core patterns:
1. **Something comes in** (PDF, email, plans, voice note, enquiry) → Self recognises → right process unfolds
2. **Structured output for review** (content pack, cost estimate, triage result, session notes)
3. **Corrections = learning** (tone edits, rate adjustments, pricing modifications, clinical corrections)
4. **Trust earns over time** (routine listings auto-approve, bordereaux runs autonomously, simple renewals process automatically)
5. **Knowledge accumulates** (brand voice sharpens, rate judgment deepens, methodology codifies, client preferences learned)

The universal primitives (card, list, input, progress, message) compose into all of these. No bespoke components needed per industry.

---

## Research Needs

These are questions where the Dev Researcher should scout gold-standard references before the Designer prototypes:

| Prototype | Research question | Why |
|-----------|------------------|-----|
| P10 (First output) | How do the best content/writing tools present AI-generated output for review and editing? | We need the edit experience to feel natural, not like "reviewing AI output" |
| P12 (Morning mobile) | What are the best mobile-first daily brief / digest experiences? (Not notification centres — actual digests) | Rob's phone experience is make-or-break |
| P15 (Knowledge base) | How do the best "second brain" / knowledge management tools visualise what's known vs what's missing? | We need this to feel like a living map, not a settings page |
| P16 (Teach this) | How do products handle implicit feedback capture? (Not explicit feedback forms — implicit from behaviour) | The correction → teach pattern must feel effortless |
| P20 (Something wrong) | How do the best monitoring/status tools surface problems without causing panic? | Calm degradation, not red alerts |

---

## Quality Gates

Every prototype must pass before moving to the next:

1. **Persona test:** Open it cold and ask "Would [Rob/Libby/Lisa/Jordan/Nadia] understand this without explanation?"
2. **Jargon scan:** No words that only a developer or product person would know. No "workflow", "trigger", "agent", "pipeline", "configuration".
3. **Knowledge visibility:** Can the user see what Ditto knows, what it doesn't know, and what knowledge is being used in any output?
4. **Progress clarity:** Does the user know where they are? What's done? What's next?
5. **Mobile check:** Does it work at 375px? (For Act 1-2 prototypes)
6. **Warm professional:** Does it match the visual identity spec? Cream, terracotta, Inter, quiet, warm?

---

## How This Feeds the Build

Once prototypes are approved:
1. **Architect** reviews prototypes against engine capabilities — identifies where the engine supports the UX and where gaps exist
2. **Architect** writes/updates the Phase 10 brief with prototype references
3. **Builder** implements from prototypes as pixel-level references (UI build strategy D)
4. **Reviewer** compares implementation screenshots against prototype screenshots

The prototypes are the contract between design intent and implementation reality.
