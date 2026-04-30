# Memory Cross-Project Promotion — UX Spec

**Date:** 2026-04-27
**Status:** Designer pass complete, post-Reviewer
**Designer-mandatory for:** Brief 224 sub-brief #4 (Project memory scope + cross-project promotion UX)
**Companion artefact for:** the Architect synthesising sub-brief #4's body
**Persona lens (primary → secondary):** Lisa (cross-product brand voice consistency across multiple ecommerce repos) → Nadia (team-wide formatting standards across her analysts' projects) → Jordan (org-wide tooling conventions). Rob NOT primary — has only one project in MVP scope.
**Design-package provenance:** Anthropic Claude Design handoff bundle (id `iK3gPHe3rGAErdm4ua2V-A`). Visual identity tokens, layout, and chat-block primitives resolve to that package per the same provenance the analyser-flow spec uses.

---

## The Design Problem

Brief 215 made `processes.projectId` a real foreign key. Sub-brief #4 of Brief 224 extends the existing memory-assembly to filter `process`-scope memories by `projectId` — corrections taught while working on `agent-crm` don't bleed into `ditto`. Memory writes inherit the process's `projectId` automatically.

But sometimes the user genuinely WANTS a memory to apply across all their projects. Lisa: "our brand voice is X — true for every marketing repo I connect, not just this one." Nadia: "we always cite data sources at the bottom — applies to every analyst's reports, not just Chen's." Jordan: "all our internal tools use feature-flags via LaunchDarkly — true across HR, finance, marketing repos."

The mechanism is simple: change `memories.scopeType` from `process` to `self`. **The UX problem is the blast-radius transparency** — the user has to understand that promoting a memory makes it apply EVERYWHERE before they tap the button. Promoting wrong is reversible but confusing; the design must make the consequences visible BEFORE the tap, not after.

The complement: the user also needs to SEE which scope an existing memory is at. Today memory citations don't visually indicate scope. After this change, "this memory is for project agent-crm only" vs "this memory applies everywhere" must be at-a-glance.

---

## Anchoring Constraints

1. **Conversation-first** (per `human-layer.md`). Promote actions surface inline in conversation OR in a memory-detail card — NEVER as a buried Settings page. The "promote my memory" question is a Decide-job moment, and Decide-job moments live in Decide-mode chat-col surfaces, not in admin nav.
2. **Mobile must be seamless.** Lisa promotes from her phone between meetings; Nadia from her phone before standup. The promote interaction has to work on a small viewport without losing the blast-radius information.
3. **Reuse existing chat-block primitives.** Designer should not propose new ContentBlock types unless genuinely needed. Per Insight-107 + Brief 072, prefer composition over invention. The existing `KnowledgeCitationBlock` (Brief 072) already cites memories in conversation; this spec extends its render with a scope pill, no new block type.
4. **Blast-radius is load-bearing.** Promoting wrong is reversible (demote back to project-scope) but is a confusing user experience — the affected projects' processes will start producing different outputs starting immediately. The design makes affected-project names visible BEFORE the tap.
5. **Promotion is an explicit user signal, never inferred.** Per Insight-127 (trust signals, not activity traces) — the system can SUGGEST promotion proactively, but it must NEVER auto-promote. The user always taps.
6. **Visual identity** anchored to the design package — semantic tokens (`text-positive`/`text-caution`/`text-negative`), the two-green signature (`--color-vivid` + `--color-vivid-deep` + `--color-vivid-subtle` + `#D1F4E1` border), DM Sans typography, chat-col-as-second-column layout.

---

## Three Surfaces (ranked)

### Surface 1 (PRIMARY) — Memory detail "promote" action

When the user opens a memory's detail (via the existing memory-list surface from Brief 199, or via tapping a `KnowledgeCitationBlock` in conversation that promotes it to detail-mode), the detail card includes:

- **Top:** the memory's content (text), type pill (correction / preference / context / skill / user_model / solution), reinforcement count + last-reinforced timestamp.
- **Inline scope pill** at the top — the canonical at-a-glance signal:
  - `Project · agent-crm` (vivid-subtle bg + `#D1F4E1` border + folder glyph) — currently scoped to one project.
  - `All projects` (vivid-subtle bg + globe glyph) — already self-scoped.
  - `Just for you` (vivid-subtle bg + person glyph) — for self-scope memories that aren't project-related (e.g., "user prefers terse responses").
- **Below content:** a `[Promote to all projects]` CTA when the memory is project-scoped. The CTA uses `--color-vivid` filled-button styling — **NOT** caution-yellow. (Reviewer flag: caution-yellow on this CTA mis-signals "this is risky" when actually the user IS in control and reversing is one tap. Vivid-filled signals "this is your call, here's the affordance.")
- **Below the CTA:** an `.alex-line` reversibility note: *"You can demote this back to a single project later — your choice doesn't lock in."*

The detail surface is the PRIMARY promote affordance because:
- The memory's full content is visible (the user reviews what they're about to broadcast).
- The reinforcement history is visible (the user can see "this has been taught 3 times across 2 projects" — proactive evidence the promotion is justified).
- The action is deliberate (the user navigated TO this surface, isn't accidentally tapping past).

### Surface 2 (SECONDARY) — Citation chip peek

When a memory cites in a conversation review (`KnowledgeCitationBlock`), tapping the chip already opens a HoverCard preview (per `human-layer.md` AI Element InlineCitation pattern). Extend the peek with:
- The same scope pill at the top of the peek.
- A `[Promote]` ghost-button affordance in the peek's actions row.

Tapping the ghost-button in the peek opens the same confirmation sheet as Surface 1 (don't re-implement the action — both surfaces converge on one confirmation flow). The peek surface is secondary because the user is in mid-review-flow; the deliberate path is to read the memory in detail first.

### Surface 3 (TERTIARY) — Proactive Self proposal

When Self detects cross-project memory repetition, it proposes promotion in the next briefing or inline in conversation. Specifics in §"We noticed" pattern below.

This surface is tertiary because it's reactive — the user didn't ask, but the cross-project signal is high enough that surfacing the proposal has positive expected value. Cooldown + dismissal mechanics protect from over-suggesting.

**Settings page is explicitly NOT a surface.** Memory promotion is a Decide moment, not a configuration choice. The Settings page would imply "configure your memory scope" which mis-frames the user task.

---

## The Promote Confirmation Sheet (load-bearing)

When the user taps `[Promote to all projects]` on any of the three surfaces, the same confirmation surface renders inline (mobile: bottom-sheet; desktop: inline below the trigger). It uses `block.evidence` + `block.decision` chat-block primitives — no new block type:

```
┌─────────────────────────────────────────────────────────────┐
│  Promote this memory to all projects                       │
│                                                             │
│  ┌─ alex-line ───────────────────────────────────────────┐  │
│  │ A  This memory will start applying when I work on     │  │
│  │    these other projects too. You can demote later.    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ block.evidence ─────────────────────────────────────┐   │
│  │  Currently applies to ─────────────── Project · agent-crm  │
│  │  Will also apply to ─────────────────── ditto                │
│  │  Will also apply to ─────────────────── redshift-pilot       │
│  │  Will also apply to ─────────────────── integrations-roadmap │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Memory: "Always include the material source country         │
│   and the sustainability angle in product descriptions."     │
│                                                              │
│  [Promote to all 4]   [Cancel]   [Restrict to specific…]     │
└──────────────────────────────────────────────────────────────┘
```

**Key UX choices:**

- **Affected projects listed by name, not count.** "Will also apply to ditto, redshift-pilot, integrations-roadmap" — Lisa sees `redshift-pilot` and instantly knows whether brand-voice memory applies there (it doesn't; she taps Cancel). Counting alone ("4 other projects") hides this insight.
- **The confirmation CTA names the count.** `[Promote to all 4]` sets expectations explicitly; Lisa knows the radius before tapping.
- **The memory content shown again** in the confirmation — last chance to read what's about to broadcast.
- **`[Restrict to specific…]` escape hatch.** Tapping opens a checklist of all currently-applicable projects (the current project pre-checked, the rest unchecked). User picks 0+ additional projects. This produces a "multi-project memory" — which the architect of sub-brief #4 must decide how to model (see Open Q1 below).
- **Reversibility note in `alex-line`** — the user knows they can demote later.
- **Mobile bottom-sheet:** same content, sticky-bottom CTA row, sections collapse to summary headers if viewport narrow (mid-evidence row "Will also apply to 3 projects ▾" expands to the full list on tap). The `[Promote to all N]` CTA stays sticky-bottom.

---

## Surfacing Project Scope on Existing Memory Views (the at-a-glance signal)

Anywhere a memory is cited or listed today, add the scope pill as a leading visual element. Three pill variants:

| Pill | When | Visual |
|------|------|--------|
| `Project · agent-crm` | `scopeType === 'process'` and the process's `projectId` is non-null. Pill includes the project slug or display name. | `--color-vivid-subtle` bg, `#D1F4E1` border, folder glyph (lucide `folder`), 12px text |
| `All projects` | `scopeType === 'self'` for memories that came from a specific process originally (now promoted) OR `scopeType === 'self'` from the start (e.g., user_model memories) | Same vivid-subtle styling, globe glyph (lucide `globe`) |
| `Just for you` | `scopeType === 'self'` for self-scoped memories the user explicitly created or that are user-model-flavored (preference: "I prefer terse responses" — applies everywhere but isn't a project signal) | Same styling, person glyph (lucide `user`) |

The pill renders in the existing `KnowledgeCitationBlock` HoverCard peek + in any memory-detail surface + in Brief 199's memory projection if shipped. **No new ContentBlock type** — extending the existing renderer with one pill is the only render-side work.

For pre-project-era memories (where the process had a NULL `projectId`), the pill is `All projects` (treated as if pre-promoted; the architect of sub-brief #4 confirms the backfill posture per Brief 224 §sub-brief #4 estimated scope: "pre-project-era memories remain visible across all projects, intentionally; no automated guess at which project they belong to").

---

## The "We Noticed" Proactive Surface

Self should proactively propose promotion when it has high-confidence cross-project evidence — but not so often that the user develops banner blindness. Trigger:

- **A memory is reinforced ≥2 times across 2+ DISTINCT projects.** NOT just reinforced ≥3 times in one project (that's project-internal pattern; doesn't justify cross-project promotion). The cross-project evidence is what matters.
- **One per briefing, max.** Self's daily briefing surfaces at most one promotion proposal at a time — even if multiple memories qualify, only the highest-reinforcement one gets the proposal. Other qualified memories stay visible in the memory list with a small "candidate for promotion" hint, but no proactive proposal until the next briefing slot frees up.
- **30-day cooldown on dismissal.** If the user dismisses a promotion proposal for a memory, that specific memory is suppressed for 30 days. (The cross-project evidence may strengthen further during the cooldown — at the next slot, the proposal can re-surface with stronger framing: "I've now seen this taught on 3 projects, not 2.")
- **NEVER auto-promote** (Insight-127, ADR-003 §3 — humans control memory writes; the harness manages, the agent proposes, the user decides).

The proactive surface uses `SuggestionBlock` (existing — `human-layer.md` §Decide primitives):

```
┌─ SuggestionBlock ────────────────────────────────────────┐
│  ✦ I noticed                                             │
│                                                          │
│  You've taught this correction on agent-crm AND          │
│  redshift-pilot. Want it to apply to all your projects? │
│                                                          │
│  Memory: "Always cite the data source at the bottom."   │
│                                                          │
│  [Promote everywhere]   [Keep per-project]   [Show me]   │
└──────────────────────────────────────────────────────────┘
```

`[Promote everywhere]` opens the same confirmation sheet (Surface 1 confirmation flow). `[Keep per-project]` dismisses for 30 days. `[Show me]` opens the memory detail surface (Surface 1) — letting the user dig in before deciding.

**Mobile:** SuggestionBlock renders inline in the briefing; on small viewports the three actions stack vertically with full-width tap targets.

---

## Persona Walkthroughs

### Lisa (PRIMARY) — promoting a brand-voice memory across her ecommerce repos

It's Wednesday morning. Lisa has 3 projects connected: her main ecommerce repo (`shopify-helpers`), a marketing-site repo (`brand-marketing`), and a legacy support repo (`support-archive`). She's been working in `shopify-helpers` and corrected an agent's product description twice — both times to remove generic adjectives ("amazing," "premium") and add the differentiator. The memory is project-scoped to `shopify-helpers`.

This morning Self surfaces a SuggestionBlock in her briefing: *"You've taught this correction on shopify-helpers AND brand-marketing. Want it to apply to all your projects?"* Lisa taps `[Promote everywhere]` on her phone (bottom-sheet pops up). The confirmation sheet lists "Will also apply to: support-archive." She frowns — `support-archive` doesn't generate product descriptions; the memory is irrelevant there. She taps `[Restrict to specific…]`, picks just `shopify-helpers` + `brand-marketing`, taps confirm. **12 seconds total. Phone-only.**

The next time the agent runs against `support-archive`, the brand-voice correction doesn't apply. The next time it runs against `brand-marketing`, it does.

### Nadia (SECONDARY) — promote then restrict

It's Thursday. Nadia manages her team's analyst-reports projects: `chen-q4-reports`, `martinez-policy-reports`, `kim-research-reports`. The agent for Chen has been corrected 3 times to add data-source citations at the bottom — all 3 corrections on `chen-q4-reports` (one project, three reinforcements). Self does NOT proactively suggest promotion — this is single-project reinforcement, not cross-project evidence.

Nadia sees the citation pattern in her end-of-week review and decides this rule should apply to ALL her analysts. She opens the memory detail (Surface 1) on her laptop, taps `[Promote to all projects]`. The confirmation sheet lists Chen + Martinez + Kim. She confirms `[Promote to all 3]`. **Done.**

But — Surface 1 also exposes the architect's open question (Q1 below): does she WANT a "promote to my analyst-reports projects, but NOT my hiring-eng-lead project (which is also project-scoped)"? The current confirmation sheet's `[Restrict to specific…]` handles this, but the model is "memory-with-explicit-projects-list" not "memory-promoted-to-self." The architect of sub-brief #4 must pick the data model.

---

## Interaction States

| State | What renders |
|-------|--------------|
| **Idle** | Memory detail with scope pill + `[Promote to all projects]` CTA OR `[Demote to project-scope]` for already-self-scoped |
| **Loading** (after CTA tap) | CTA spinner; memory content stays read-only |
| **Success** (after server confirmation) | Scope pill swaps to `All projects` with subtle vivid-flash animation; success TextBlock from Self in conversation: "Promoted. The correction now applies on shopify-helpers + brand-marketing + support-archive." |
| **Error** (server reject — e.g., concurrent edit collision) | Inline `AlertBlock` below CTA: "Couldn't promote — try again?" with retry; CTA re-enables |
| **Empty** (no project-scoped memories yet) | Memory list shows existing memories at their current scope; no promote affordance until at least one project-scoped memory exists |
| **Partial** (the user picked `[Restrict to specific…]` and saved a 2-of-3 selection) | Scope pill shows `2 projects` (pluralised), tapping opens the project list; demote-back-to-single-project still available |
| **Suppressed** (proactive proposal in 30-day cooldown after dismissal) | NO surface — the SuggestionBlock simply doesn't appear in the briefing |

---

## Six-Jobs Mapping

| Job | Role in this flow |
|-----|-------------------|
| **Decide** (PRIMARY) | The promote choice IS a Decide moment — "what should change?" — about the agent's behaviour across projects. |
| **Review** (SECONDARY) | The user reviews the memory's content + reinforcement history before deciding to promote. |
| **Orient** (TERTIARY) | The scope pill on existing memory views is an Orient signal — "where does this apply?" |
| Define / Delegate / Capture | Not directly served. (Define is upstream — the user defined the project; this flow operates on memories that ALREADY exist.) |

---

## Open Design Questions for Architect Synthesis

1. **Multi-project memories: explicit projectIds[] or self-with-exclusions?** When the user picks `[Restrict to specific…]` and selects 2 of 3 projects, the data model can be: (a) `scopeType='self'` with a NEW `projects.appliedProjectIds: string[]` field (memory is self-scoped but filtered at retrieval), OR (b) duplicate the memory N times with `scopeType='process'` for each picked project (loses dedup), OR (c) keep it `scopeType='process'` against the original project but add an `appliesToProjects: string[]` field (clean but new column). Architect picks; the picker UX stays the same regardless.

2. **Demote target on archived projects.** When the user demotes a self-scope memory back to project-scope, but the original `projectId` is now archived, what happens? Pick the highest-reinforcement-count project from the audit trail? Throw an error? Force the user to pick a target project from current `'active'` projects? Architect call.

3. **Proactive proposal channel.** The spec defaults to "in the daily briefing." Should the SuggestionBlock also appear inline in the conversation when the user is actively reviewing a memory citation (via the citation HoverCard peek)? Architect call.

4. **Backfill pill text.** Pre-project-era memories (where `processes.projectId` was NULL pre-Brief-215) currently render `All projects` per the spec. Is this honest, or does it hide the fact that these memories were never DELIBERATELY promoted? Alternative: a fourth pill `Pre-projects` (legacy) with a one-time prompt "do you want to keep this everywhere or restrict?" Architect call.

5. **Telegram / mobile-only confirmation** — does the same confirmation sheet render on Telegram (Brief 098)? The Brief 098 surface is text + button; the affected-projects-list is hard to render. Architect call: omit the action on Telegram (mobile web only) OR render a compact text-only variant.

---

## Reviewer Pass Summary (2026-04-27, inline self-review)

Re-read the spec cold for defects:

- **Caution-yellow on the promote CTA mis-signals risk.** First draft used `--color-caution` for the CTA — implies "this is dangerous." But the action is reversible and the user is in full control. Fixed: vivid-filled CTA (`--color-vivid` bg) signals "this is your affordance" without false alarm. The reversibility note in `alex-line` carries the gentle framing.
- **Proactive trigger was under-specified** in the first draft ("when reinforced ≥3 times"). That triggers on single-project repetition too — which is project-internal pattern, NOT a cross-project promotion signal. Tightened: trigger is ≥2 reinforcements across ≥2 DISTINCT projects. The cross-project signal is the load-bearing condition.
- **Demote location wasn't specified** in the first draft. Added §Surface 1 — the memory detail surface flips between `[Promote to all projects]` and `[Demote to project-scope]` based on current state.
- **Nadia's walkthrough exposed Q1** (multi-project memory data model) — added to Open Questions. The walkthrough showed a real user wanting "promote to SOME projects, not all" — the spec accommodates this in the picker UX, but the architect must pick the data model.

All four defects fixed in-session before Designer hand-off.
