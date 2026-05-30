# Brief 275 — Background Watch and Network Health · UX Interaction Spec

**Date:** 2026-05-19
**Status:** draft (pre-review)
**Author role:** Dev Designer
**Related briefs:** 270 (Network Superconnector parent), 273 (Active Request), 274 (Manual Search / Possible Connection), 261 (Intro counter + refusal), 276 (Intro facilitation, downstream), 279 (Discovery + claim invites, sibling), 278 / 285 (Privacy Center, model for Curate surfaces)
**Companion file:** `docs/research/275-background-watch-network-health-ux-patterns.md` (industry pattern survey)

---

## 1. What we are designing

Background Watch is the **"always-on superconnector"** behaviour. When a user has an Active Request or a Member Signal, Ditto can keep watching quietly in the background — sensing new public/member signals, scoring fit, applying network-health rules, and surfacing a small number of explainable proposals on a calm cadence.

The product test: *would Rob trust Ditto to keep working on his "find a marketplace ops expert" request while he's on a job site, without spamming him?* If a single watch run produces only weak fits, **Ditto stays quiet** — and the user can tell at a glance that nothing strong came up, with no anxiety that something was missed.

This is the opposite of LinkedIn's "you have 47 new updates" pattern. It is closer to a real human superconnector who, asked to keep an eye out, comes back two weeks later and says either *"I found two — and here's why"* or *"nothing strong yet."*

## 2. Persona test

| Persona | Does Background Watch serve them? | Hardest-case moment |
|---|---|---|
| **Rob** — trades MD on job sites 60% of day | **Yes — primary persona.** Rob cannot scroll a feed. He needs Ditto to come to him on a weekly cadence, surface 0-3 proposals, and let him approve/decline from his phone in 30 seconds between jobs. | A Tuesday morning digest with two proposals — Rob skims, taps "Save proposal" on one, "Not a fit — too academic" on the other, locks his phone. Whole interaction <60s. |
| **Lisa** — ecommerce MD, between warehouse / meetings / home office | **Yes.** Lisa is most likely to start a watch from an Active Request she defined earlier ("evening dressmaker supplier with consistent QC"). She wants to see fewer, better candidates with proof. | Lisa opens the digest at her home office, expands evidence on one proposal, follows a source link to a portfolio, then refines: *"more boutique, less mass-market."* The refinement updates ranking — she sees the change in the next run, not in some opaque setting. |
| **Jordan** — generalist technologist | **Yes — but in a secondary mode.** Jordan is most likely to run *several* concurrent watches across the organisation ("automation tool vendors," "fractional CFO candidates"). They care about a status surface — what's running, how it's performing, what failed. | Jordan opens `/network` on their desktop Monday morning, sees a Watch Status list with last-run time, proposal counts, and any errors. They pause one watch ("HR automation vendors") that is producing too much noise, refine it, resume. |
| **Nadia** — team manager with specialist agents | **Partially.** Nadia's interest is supervising what Ditto is doing on behalf of the people she manages — but in v1 watches are user-scoped. Nadia's surfaces (team-level monitoring) are deferred. | (Out of v1 scope for Brief 275.) |

**Mobile-first design constraint surfaces from Rob.** Every watch surface must work on a 375px-wide screen with one-thumb navigation. The digest email must be parseable on a lock-screen preview.

## 3. Human jobs served

Background Watch is unusual: **it touches all seven jobs** (six original + Curate per Insight-238), with three load-bearing.

| Job | How Background Watch serves it | Load-bearing? |
|---|---|---|
| **Orient** — "what's going on?" | Watch Status surface tells the user what watches are active, when they last ran, what they found. Digest summarises a run. | Yes |
| **Review** — "is this right?" | Each watch proposal must be reviewable: why, evidence, risks, what changed. The proposal **is** a review object. | Yes — primary |
| **Define** — "what needs to happen?" | Users define a watch by anchoring it to an Active Request or Member Signal — the anchor IS the definition. Refinements modify the anchor or the watch settings. | Yes |
| **Delegate** — "who does it and how much do I trust them?" | Watch frequency / contact policy / cap settings are trust dials. Pause is the ultimate trust dial. | Yes |
| **Capture** — "here's something the system needs" | Implicit feedback: accept, decline + reason, "more like this," refinement language. Edits ARE feedback (Ditto principle). | Yes |
| **Decide** — "what should change?" | Approve a proposal → Brief 276 intro consent gate; or "save as Active Request," or close the watch entirely. | Yes |
| **Curate** *(7th, per Insight-238)* — "is what Ditto knows/does on my behalf correct, mine, and revocable?" | Watch settings (frequency, scope, sources, contact policy) are a Curate surface. Pause/refine/close is the user's continuous control over agent autonomy. The Privacy Center (Brief 285) is the primary entry point. | Yes — primary |

**No other capability we have built or briefed activates so many jobs at once.** This is the heart of the always-on superconnector posture and the reason this brief is load-bearing for the rest of Phase 14.

## 4. Reference docs check

| Doc | Status |
|---|---|
| `docs/personas.md` | Checked — all four personas accurately represented; mobile-first mandate honoured. No drift. |
| `docs/human-layer.md` | Checked — Curate-as-7th-job (Insight-238) not yet absorbed; this spec describes watch settings as a Curate surface in anticipation. Documenter will absorb after human ratifies. |
| `docs/architecture.md` | Checked — operating cycle archetype (sense→assess→act→gate→land→learn→brief) is the engine shape. Proactive composition pattern (`relationship-pulse.ts` lineage) applies to digest email composition. No drift. |
| `docs/insights/238-curate-is-the-seventh-human-job.md` | Read; this spec applies the ruling to watch settings. |
| `docs/insights/archived/024-design-and-engineering-are-different-cognitive-modes.md` | Read; respected by keeping this spec design-led with explicit Architect open questions in §17. |

No reference docs were modified by this spec. Updates flow through the Documenter after the human approves.

---

## 5. Process-architecture concerns (L1)

> Can a non-technical process owner read the watch definition and understand what Ditto will do?

The watch object decomposition should match how the user thinks about *"keep an eye out for X."* Recommended user-facing decomposition (the Architect chooses the implementation shape, but **the names must be these or close to them**):

```
Watch
├── Anchor              "What am I looking for?"            → Active Request | Member Signal
├── Sources             "Where should you look?"            → Ditto members + Public web (default both)
├── Frequency           "How often should you check?"       → Quiet (only strong fits) | Weekly digest | Manual only
├── Cap                 "How many proposals max?"           → Default 3 per digest
├── Contact policy      "Can you ever contact someone?"     → Never without my approval (locked in v1)
├── Network health      "What should you avoid?"            → (shown as a list; not edited by user in v1)
└── Status              "What's happening now?"             → Active | Paused | Closed | Fulfilled | Error
```

**The user does not edit "rank thresholds," "stepRunId guards," or "operator review queues."** Those exist in the engine; the user sees their effects (the proposal showed up; the proposal was suppressed; the candidate was flagged for invite review later).

**Two L1 readability tests pass for this decomposition:**
1. Rob can describe his watch in one sentence: *"Find me a marketplace ops expert, quietly, max 3 a week, never contact anyone without me."*
2. Lisa can refine without learning new vocabulary: *"Make it more boutique"* updates the anchor; *"only weekly"* updates frequency; *"pause for two weeks"* updates status.

---

## 6. Watch lifecycle (user-facing)

```
                      ┌────────────────────────────────────────────┐
   create from        │                                            │
   Active Request ───▶│                                            │
                      │   ACTIVE  ──────run──────▶  proposes 0-N   │
   create from        │     │                          │           │
   Member Signal ───▶ │     │                          ▼           │
                      │     │                       digest         │
   create from        │     │                          │           │
   Possible        ──▶│     │                          ▼           │
   Connection         │     │                       review         │
   ("Keep watching")  │     │                          │           │
                      │     ▼                          │           │
                      │   PAUSED ◀──pause───────       │           │
                      │     │                  │       │           │
                      │     └──resume──────▶ ACTIVE ◀──┘           │
                      │                                            │
                      │   CLOSED ◀───close──────  (any state)      │
                      │   FULFILLED ◀──user marks request fulfilled│
                      │   ERROR  (admin-visible, user sees soft)   │
                      └────────────────────────────────────────────┘
```

The three creation entry points (Active Request, Member Signal "Find me opportunities", "Keep watching" on a Possible Connection) all converge to the same Watch object. The decline-and-feedback path goes through the digest, not a separate inbox.

---

## 7. Surface inventory

| Surface | Purpose | Composition (existing primitives + new) | Job |
|---|---|---|---|
| **A. Watch creation prompt** | Inline confirmation when user starts a watch from any of the three entry points. | `AuthorizationRequestBlock` (existing) configured as "Start watch?" with frequency / cap / sources presets. Reuses Brief 261 approval primitive. | Define / Delegate |
| **B. Watch Status card** | Lightweight at-a-glance summary of one watch — anchor, status, last run, proposals queued. | New component `watch-status.tsx` composed from `StatusCardBlock` (existing) + small inline action buttons. | Orient / Curate |
| **B′. Multi-watch list view** | Jordan's case: 4+ active watches surfaced together. Stacks Surface B cards. Lives inside Privacy Center Watch list (Brief 285) and is the entry point when the user types "show my watches" in chat. Sort: most-recent-run first; group by status (active / amber / paused). Empty state: *"No active watches yet — start one from any Active Request or 'Find me clients' Member Signal."* | List of Surface B cards. No new component needed. | Orient / Curate |
| **C. Watch Proposal Queue** | List of proposals from a single watch run, awaiting user review. | List of `PossibleConnectionCard` (existing, Brief 274) wrapped with a run-context header (when ran, what changed). New shell `watch-proposal-queue.tsx`. | Review |
| **D. Watch digest email** | Periodic outbound delivery via `notifyUser`. | Same `PossibleConnectionCard` rendered for email (block→AI-Element pipeline). Subject + intro + max-3 cards + one CTA. | Orient / Review |
| **E. Watch settings panel** (Curate) | Refine, pause/resume, close, change frequency, change sources. | Sub-section under Privacy Center (Brief 285) + inline panel reachable from Watch Status card. Reuses Privacy Center patterns. | Curate |
| **F. "Nothing this week" state** | What the user sees / receives when a run produces no strong fits. | Quiet state — see §11. | Orient (calm) |
| **G. Network-health suppression copy** | Inline on a suppressed-or-downgraded proposal — explains why this person is "not currently recommended." | Reuses `PossibleConnectionCard.notRecommendedReason` field (already in Brief 274). | Review |
| **H. Watch error / admin notice** | When a run fails, surface to admin (already in admin queue); user sees a soft notice only if multiple runs fail. | Reuses Brief 278 admin/observability surfaces; user-facing is one inline `StatusCardBlock`. | Orient |

**Critical: no new ContentBlock primitives are required.** The 26-type union (per Brief 278) absorbs all of this through composition.

---

## 8. Surface A — Watch creation prompt (inline)

**Trigger context determines copy:**

- From **Active Request** (most common): *"Want me to keep watching for {request title}? I'll check member sources + the public web weekly and only surface strong fits."*
- From **Member Signal** ("Find me opportunities"): *"I can keep an eye out for {opportunity shape}. I'll come back with proposals on Mondays — and stay quiet if nothing strong shows up."*
- From a **Possible Connection** card ("Keep watching"): *"I'll watch for new evidence or timing changes on {name} and re-surface them if things change."*

**Confirmation control set (`AuthorizationRequestBlock`):**

```
[ Start watch ]  [ Not now ]  ⚙ Adjust

Defaults shown:
  ▸ Sources:    Ditto members + public web
  ▸ Frequency:  Weekly digest (Monday morning)
  ▸ Max per run: 3 proposals
  ▸ Contact policy: Never contact anyone without your approval  ← locked
```

The "⚙ Adjust" button is progressive disclosure into the settings panel (Surface E). Most users hit "Start watch" with defaults; Lisa/Jordan are the ones who will adjust.

**Rob's path:** taps "Start watch," sees a one-line confirmation in chat (*"On it. I'll come back Monday."*), closes the app. No additional friction.

---

## 9. Surface B — Watch Status card

Rendered in two places:
1. Inline in chat after creation and after each run (the user's primary surface).
2. In the user's request workspace alongside the anchor (Active Request / Member Signal).

**Anatomy:**

```
┌──────────────────────────────────────────────────────────────────┐
│  ●  Watching: marketplace ops expert                ⚙             │
│     Ditto members + public web · weekly · max 3                   │
│                                                                   │
│     Last run 2d ago — surfaced 2 proposals, both pending review.  │
│                                                                   │
│     ┌──────────────────┐  ┌──────────────┐  ┌─────────┐           │
│     │ Review proposals │  │ Run now      │  │ Pause   │           │
│     └──────────────────┘  └──────────────┘  └─────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

**States** (ambient health indicator semantics drawn from pattern survey §6 — headhunter cadence + Calm Technology):

| State | Dot colour | First line | Action set |
|---|---|---|---|
| Active, fresh | green | "Last run {N}{d/h} ago — surfaced {N} proposals." | Review · Run now · Pause |
| Active, quiet (≤ 2 weeks) | grey | "Scanned {N} people {date}. Nothing strong yet." | Review near misses · Run now · Refine · Pause |
| Active, quiet (≥ 3 weeks) | amber | "I've scanned {N} people but nothing has cleared the bar in {N} weeks. Want to refine?" | Refine · Adjust threshold · Pause · Close |
| Active, running | spinner | "Checking now…" | (actions disabled) |
| Paused | amber | "Paused {date}. I won't run until you resume." | Resume · Refine · Close |
| Closed | grey | "Closed {date}. {Reason if user provided.}" | Reopen · View history |
| Fulfilled | green-check | "Marked fulfilled — congrats." | View history · Start a new watch |
| Error | amber-soft | "Last run had an issue. The Ditto team can see this." | Refine · Run now · Pause (no panic UI) |

**The "≥ 3 weeks" amber state is load-bearing** — it is the calibration prompt that prevents a silently failing watch from looking the same as a silently quiet watch. It addresses the "is it broken or just quiet?" anxiety the pattern survey identifies as a defect across mainstream background-agent products.

**Mobile collapse:** on <400px, the card shrinks to icon + anchor + dot + a single "Review" or "Open" button. The other actions are behind a 3-dot overflow.

---

## 10. Surface C — Watch Proposal Queue (in-app review)

**Triggered by:** clicking "Review proposals" from Status card, or from the digest email's "Open in chat" link.

**Anatomy:**

```
Watching: marketplace ops expert · Run from Monday morning
2 proposals · 1 person held back for network-health reasons

▼ Why I surfaced these now
   Two new public-web signals matched your "messy two-sided
   network" framing — a portfolio update from {name} and a
   recent podcast appearance by {name2}. Nothing new on the
   member side this week.

──────────────────────────────────────────────────────────────
[Proposal Card 1 — PossibleConnectionCard, full]
──────────────────────────────────────────────────────────────
[Proposal Card 2 — PossibleConnectionCard, full]
──────────────────────────────────────────────────────────────

▾ 1 person held back (tap to expand)
   ▸ {Name} — strong fit, but I asked them about 3 intros this
     month already. I'll surface them again in 2 weeks.
```

**Three things this surface must do that the existing Manual Search results panel does not:**

1. **Run-context header.** Why this run, what changed since last run. This is what makes the watch feel like an agent doing work, not a refreshed search.
2. **"Near misses" collapsible** (renamed from "held back" per pattern survey §6 — the headhunter language is more durable and less defensive). Network-health-suppressed or just-below-threshold proposals are surfaced honestly but de-emphasised, with the specific blocking criterion named. Hiding them entirely would feel untrustworthy; showing them with full weight would defeat the suppression. The collapsible is the design middle path. Each near-miss states the **specific blocking criterion**: *"strong fit — but no mutual intro path"*, *"strong fit — asked them about 3 intros this month."*
3. **Cohort feedback.** A "none of these are right — refine" button at the bottom captures bulk feedback when the watch is producing the wrong category of person.

---

## 11. Surface F — Quiet state / "Nothing this week"

This is the most distinctive copy in the whole brief, because **silence done well is the product**. Default LinkedIn-style products solve "we sent something every week" by lowering quality; Ditto must solve it by being comfortable saying nothing.

**Empirical anchor (pattern survey §3, §6):** LinkedIn Job Alerts and Google Alerts both **suppress the digest entirely** when nothing new exists — they do not send "nothing this week" emails. The headhunter analogue is more nuanced: a top buyer agent doesn't go silent — they send brief market context ("inventory in Lincoln Park is down 18% — it's not you, the market is tight"). The Calm Technology principle ([calmtech.com](https://calmtech.com)) operationalizes the same idea: information stays at the periphery until it's worth moving to the centre.

**Designer recommendation (revised from earlier draft, aligned with the survey):**

1. **Digest email: suppress entirely when no proposals clear the threshold.** No "quiet week" email. This is the cap-discipline principle from §12 turned upside-down: cap discipline isn't just an upper bound, it's an *honesty bound* — when the strong fit doesn't exist, the digest does not exist either.
2. **In-app ambient health indicator on Watch Status (Surface B).** The Status card always shows when the last scan ran and what it looked at: *"Scanned 847 people Monday — 2 near misses, no strong fits."* Green dot = scanning, recent strong fits. Amber dot = scanning, no strong fits in N+ weeks → consider refining criteria. Red dot = scanning failed (admin-visible). This is what answers the "is it broken or just quiet?" anxiety without pushing a notification.
3. **"Near misses" inline on the Watch Status card** (and in the digest header when a digest fires): a one-line context line — *"Two were close — one was too senior, one had no mutual intro path."* Specific, honest, forward-looking, just like the human headhunter language.

**The user-visible cadence is the proposal arrival; the underlying scan is continuous.** Surface this in copy: *"I watch continuously. I'll send a digest when something is worth your time."*

**Anti-pattern to avoid:** padding the digest with weak fits to "have something to send." This is the LinkedIn anti-pattern. Cap discipline matters more than cadence consistency.

**One affordance left to the user (Curate panel toggle):** *"Tell me even when there's nothing this week."* Off by default. Some users (Lisa, Jordan early in a watch) may want explicit confirmation. The default is honest silence; the override is on-request.

---

## 12. Surface D — Watch digest email

**Subject line patterns (the Architect should A/B between):**

- Strong fits found: *"Two for your marketplace ops search"* (specific, present tense, no exclamation).
- Held back: append *"(plus one I held back)"* only if a held-back item exists.
- Quiet week: *"Quiet week on your marketplace ops search."* **Used only when the user has opted into "Tell me even when there's nothing this week" (§11 / §15 — off by default).** With the default setting, no quiet-week email is sent at all.

**Body structure (max ~150 words above the cards):**

1. **One-line greeting from Alex/Mira** (the Self persona on the workspace) — *"Quick update on your marketplace ops search."*
2. **One-line summary** of what was found, what's quiet.
3. **Each card** (max 3) renders as a compact `PossibleConnectionCard`-for-email: name, headline, "why this fits" first line, "open to review" CTA.
4. **One primary CTA** at the bottom: *"Open all in chat."* This honours the email-for-decision / chat-for-context pattern from Brief 276.
5. **Quiet footer:** *"Pause this watch · Refine · Close."* Magic links.

**Compliance touch points (handled by Brief 278):**
- Sender identity match.
- Suppression list pass (Brief 278 + Brief 279 compliance).
- One-click unsubscribe = pause this watch (not unsubscribe-all — that is a separate Curate action).
- Existing `notifyUser` throttle applies; this is critical — the brief says "no parallel email path."

**Mobile rendering:** the email must be readable on a 320px-wide lock-screen preview. Subject + first card's first line must be informative within ~80 chars.

---

## 13. Network-health explainability

The 8 v1 network-health rules (block, anti-persona, over-contact target, requester over-asking, duplicate cooldown, stale evidence, commercial review queue, low confidence) all produce **either suppression or downgrade**. The user must understand the difference.

**Suppression** = the proposal is held back from the surfaced set. User sees it only inside the "Held back" collapsible, with a one-sentence reason.

**Downgrade** = the proposal is surfaced but with `notRecommended: true` and a softer card treatment (Brief 274 already has `notRecommendedReason`).

**Copy patterns — what the user sees in the "near misses" collapsible (named blocking criterion is the headhunter standard, per pattern survey §6):**

| Rule | Near-miss copy | Why this wording |
|---|---|---|
| 1. Target has explicit block | "Not surfacing — they've told me to keep them out of this." | Honest but does NOT reveal who blocked whom or why (Brief 261 Hard Rule #5). |
| 2. Anti-persona match | "Not surfacing — strong mismatch with your anti-persona." | Names the user's own rule, not the target's. |
| 3. Over-contact target | "Strong fit — but I've asked them about {N} intros this month. I'll surface them again {date}." | Sets expectation, names the throttle, gives a future date. |
| 4. Requester over-asking | "I'm holding new proposals until your other asks resolve — you have {N} outstanding." | Names the dial, points at the cause the user can fix. |
| 5. Duplicate cooldown | "Already proposed in your last digest — I'll re-surface only if something changes." | Honest about freshness. |
| 6. Stale/weak evidence | (downgrade) Card shows risk: "Evidence is from {Y}+ ago." | Risk on the card itself, not a near-miss item. |
| 7. Commercial review queue | "Sensitive enough that I want a human at Ditto to glance first — surfaces after review." | Honest, names operator review without leaking process. |
| 8. Low confidence | (downgrade) Card shows confidence badge: low. | Reuses Brief 274 confidence dot. |

**Hard rule:** the held-back copy NEVER quotes private claims, private anti-persona text, or any reason that would let the user infer the target's anti-persona or block list. Brief 261's rule applies in full.

---

## 14. Feedback granularity

Brief 275 AC14 says "user feedback on proposals affects subsequent watch runs." The design must make this feel like teaching a colleague, not filling out a form.

**Inline on each proposal card (composable from existing actions):**

- **Save proposal** → Brief 276 consent gate. (Primary action.)
- **Three-state dismiss** (key revision from pattern survey §5):
  - **Not now** → resurface after ~90 days, do not adjust ranking strongly. *"Right person, wrong moment."*
  - **Not a fit** → suppress this person for this watch for ~1 year, adjust ranking weakly. *"Wrong for this search."*
  - **Wrong person entirely** → permanent suppress for this watch + add an explicit signal to the watch's anti-persona profile. *"This is not the kind of person I want."*
  Each is a single tap. After tap, an **optional** chip strip appears (LinkedIn-style; the dismiss itself is the signal, the reason is bonus): *too junior · too senior · wrong domain · too commercial · too academic · already know them · location · other*. The chip strip does NOT gate the dismiss — it appears as a 5-second after-action affordance.
- **More like this** → quick boost; no input needed. Inline "✓ Boosted" confirmation for 2s.
- **Refine** → opens a freeform natural-language input (*"more boutique, less mass-market"*). This is THE primary refinement vector. Edits are feedback.
- **Watch other person** → secondary; saves to invitation-candidate queue if non-member.

**Why three dismiss states matter (per pattern survey §2 critique of Zillow):** in real estate, "hide" = permanent is fine because you really don't want that house again. In networking, the same person may become relevant in six months. A single "Not a fit" button is too coarse for relationship data.

**Bulk feedback on the queue (when the whole run is off):**

A "None of these are right — refine" button at the bottom of the queue. Captures: *"What about this run was wrong?"* Freeform + chips. This is the cheapest "you missed the brief" feedback path.

**Implicit signals that count without explicit feedback:**

- User saved 1 of 3 proposals → that 1 is a positive signal; the other 2 are weak negative (not "not a fit" but "not chosen").
- User skipped digest entirely → mild negative; rank threshold slightly tightens.
- User refined the anchor (Active Request) after a digest → strong feedback that the previous run was off.

**The Architect must decide (D-Q4)** how strongly each implicit signal weights versus explicit "not a fit" feedback.

---

## 15. Refine / Pause / Resume / Close (Curate surfaces)

These are **Curate** in the Insight-238 sense: the user inspecting, correcting, and revoking what the agent does on their behalf.

**Surfaces:**

1. **Inline on Watch Status card** — pause/resume one-tap.
2. **Watch settings panel** — full controls. Reachable from ⚙ on the Status card OR from the Privacy Center (Brief 285) Watch list.
3. **Digest email footer magic links** — pause/refine/close from email without opening the app. Critical for Rob.

**Settings panel contents:**

| Setting | Control | Default | Curate concern |
|---|---|---|---|
| Anchor | Read-only link to Active Request / Member Signal | (from creation) | Edit the anchor instead of the watch. |
| Sources | Toggle: Ditto members · Public web · Both | Both | "Where can Ditto look for me?" |
| Frequency | Radio: Quiet (only strong) · Weekly · Manual only | Weekly | "How often should you bother me?" |
| Cap per run | Stepper 1-5 | 3 | "How much can fit?" |
| Quiet-week digest | Toggle: send / don't | Send for 3 weeks, then don't | "Tell me even when nothing's there?" |
| Contact policy | Read-only: "Never without my approval" | Locked v1 | Honesty about agent autonomy. |
| Refine | Freeform textarea | (empty) | "What should be different?" |
| Status actions | Pause · Resume · Close · Mark fulfilled | Active | The big trust dial. |

**"Mark fulfilled" is its own status** distinct from "Close" because it captures **outcome** — fed into Brief 276's outcome feedback loop and the Brief 119/270 economic-outcome metric thread. *"Closed"* = "stop, but not because it worked." *"Fulfilled"* = "it worked, here's what we got."

**Pause durations** the user can pick:
- Until I unpause
- 7 days
- 14 days
- 30 days
- Until {Active Request resolved}

Borrowed from snooze patterns in mature digest products (see companion pattern survey).

---

## 16. Failure states

Brief 275 AC15: failed watch runs are visible to admins/operators and do not spam users.

**Design rule:** users should NEVER see "watch failed" as a notification or email. Failures route to the admin/observability surfaces (Brief 278). The user-facing surface degrades gracefully:

- **One failure:** silent. The watch's last-run timestamp does not advance; the Status card simply shows the previous run's "last run X days ago." No badge, no error.
- **Two consecutive failures:** Status card shows the soft amber state from §9: *"Last run had an issue. The Ditto team can see this."* No technical detail. The user retains all actions.
- **Three or more consecutive failures, OR a paid-watch contract:** the Status card adds *"I've paused this until I can get back to you."* — and the watch is automatically paused. (Open question D-Q5: should the Architect auto-pause at N=3 or surface a user choice?)

This is the same principle as Brief 261's refusal copy: honest, calm, no panic UI, never leaks internal mechanism.

---

## 17. Mobile primary path (Rob test)

Rob's job-site interaction model is the litmus test. The following must work on a 375px-wide screen, one-thumb, in <60 seconds:

1. **Notification arrives** (workspace channel or email lock-screen preview). Subject is informative: *"Two for your marketplace ops search."*
2. **Tap.** Opens the digest in chat (mobile web) or in-app.
3. **Three proposals stacked vertically.** Each card is full-width, content above the fold = name + first line of "why this fits."
4. **Two primary buttons per card,** large tap targets (min 44px): *Save proposal* (primary, brand accent) and *Not a fit* (secondary).
5. **"Not a fit" opens a sheet** with chip categories. Rob taps "too academic." Sheet closes.
6. **Next card.** Rob taps *Save proposal*. Inline confirmation: *"Saved. I'll bring this to the requester approval step."*
7. **Locks phone.** Total elapsed: <60s. No additional friction.

**Mobile-only compromises:**
- The "Why I surfaced these now" header collapses by default; tap to expand.
- The "Held back" collapsible defaults to closed on mobile.
- Refine is reachable but not on the front surface; it lives behind a "Refine" link at the bottom of the queue.
- Settings panel is a separate page on mobile (not a sidesheet).

---

## 18. Interaction states

Each surface has its full state matrix. The Architect should ensure these are all implemented:

| Surface | loading | empty | partial | error | success |
|---|---|---|---|---|---|
| Watch creation prompt | (disabled buttons + spinner) | n/a | n/a | "Couldn't start that watch — try again." | "On it." |
| Watch Status card | "Checking now…" with spinner | n/a | "Last run partial — public web unavailable, member-only this week." | soft amber per §16 | green dot + "surfaced N" |
| Proposal Queue | skeleton cards | "Nothing strong this week." with refine CTA | "Member results in; public web still searching." | "Couldn't complete this run." retry | full cards rendered |
| Digest email | n/a (server-side) | "Quiet week on {anchor}." | n/a | n/a | full cards rendered |
| Settings panel | "Saving…" | n/a | n/a | "Couldn't save that change — try again." | "Saved" inline confirmation |
| Pause/resume | optimistic, spinner overlay | n/a | n/a | revert + "Couldn't pause — try again." | dot colour changes immediately |

**Partial states matter** — Brief 274 already specifies that search can return partial (member results now, public-web still running). Watch runs inherit this: a watch run is a search + ranking + network-health pass. The user should see partial results land and update in place.

---

## 19. Copy guidance — the "always-on superconnector" voice

The copy across all watch surfaces should sound like a calm, competent superconnector who **is comfortable with silence**. Anti-patterns to avoid:

| Avoid | Why | Do instead |
|---|---|---|
| "You have 3 new candidates!" | Marketplace feed energy; "new" alone is not a reason to look. | "Two for your marketplace ops search." |
| "Don't miss these matches!" | Loss aversion + manufactured urgency. | "I found two worth your time." |
| "{N}+ jobs matching" | LinkedIn-style scale signal; we don't compete on volume. | (silence on volume) |
| "Click here" / "View now" | Generic CTA; we use specific actions. | "Open all in chat" · "Save proposal" |
| "We searched our database" | Implies marketplace database. | "I checked members and the public web." |
| Em-dashes as decorative pauses | The voice is direct, not literary. | Period. New sentence. |

**Voice fingerprint:**
- First-person *I* (Alex/Mira posture).
- Present tense for state, past tense for what was done.
- Specific over abstract: *"{Name}'s portfolio updated last week"* > *"new public signal."*
- Honest about gaps: *"I don't have proof yet — want me to dig deeper?"*
- Quiet weeks are not failures. Silence is data: *"Nothing strong this week."*

**Ritual framing (per pattern survey §4, §5 — Stratechery + Discover Weekly).** The watch's cadence should be named as a ritual, not as a setting. In the Watch creation prompt and Status card: *"Your Monday network scan"* is better than *"Weekly background watch run."* Ritual framing builds the habit loop and trains the user to anticipate the digest. The underlying scan is continuous; the *delivery* is ritualized. Surface this distinction in copy: *"I watch continuously. I send a Monday digest when something is worth your time."*

---

## 20. Process-as-primitive — what the watch reads like to a non-technical owner

Per CLAUDE.md "process as primitive," the watch definition should be **legible** to its owner. A YAML or schema view (Architect's choice) for a Rob-style watch should read approximately:

```
Watch: marketplace ops expert  (id: w_abc)
  anchor: Active Request — "marketplace ops expert for messy two-sided"
  sources: [members, public-web]
  frequency: weekly  (Mondays 09:00 local)
  cap: 3
  contact_policy: never_without_my_approval
  feedback_history:
    - declined: "too academic" × 2
    - boosted:  "more commercial" refinement applied
  status: active  (last_run 2d ago, next_run 5d)
```

This shape passes the L1 readability test. The engine fields (stepRunId tracking, wrapper run ids, throttle counters) live below this layer.

---

## 21. Mapping to existing ContentBlocks

**No new ContentBlock primitives should be required for Brief 275.** Mappings:

| Watch surface element | ContentBlock used |
|---|---|
| Watch creation confirmation | `AuthorizationRequestBlock` (existing, Brief 248/261) |
| Watch Status card | `StatusCardBlock` + small ActionBlock cluster |
| Watch Proposal card | `PossibleConnectionCard` (existing, Brief 274) — already has why / evidence / risks / confidence / actions |
| Run-context header | `TextBlock` rendered with light heading style |
| Held-back collapsible | `CollapsibleBlock` if one exists, else compose from `TextBlock` + disclosure pattern |
| Digest email body | Markdown rendered from the same ContentBlock list as in-app |
| Network-health refusal copy | `notRecommendedReason` field on PossibleConnectionCard (existing) |
| Settings panel | Compose from `InputRequestBlock` (toggles, radios) + `ActionBlock` |
| Pause/resume actions | Native `ActionBlock` |

**Verify with the Architect (D-Q6):** does a `CollapsibleBlock` (or equivalent disclosure primitive) exist? If not, the disclosure is acceptable as a **UI-level composition inside the `watch-proposal-queue.tsx` component** — the "no new primitives" constraint applies to the ContentBlock discriminated-union schema, not to internal component composition. A new schema primitive in the 26-type union would require explicit ratification; a `<details>`/`<summary>` style disclosure rendered inside an existing card shell does not.

The "no new primitives" discipline matters because Brief 278's Curate ruling is conditional on the 26-type union staying stable.

---

## 22. Sub-process / engine concerns flagged for the Architect (D-Q list)

These are explicitly **NOT design decisions**. They are user-facing seams where the design depends on an Architect call:

- **D-Q1 — Quiet-week digest default.** *(Revised after pattern survey integration.)* The empirical answer is **suppress the email entirely** (LinkedIn / Google Alerts default; Calm Technology principle) and rely on the in-app ambient health indicator on the Watch Status card (§9, §11). Designer recommendation: default to suppression; expose a single Curate toggle *"Tell me even when there's nothing this week"* (off by default). Architect to confirm `notifyUser` handles silence + ambient-only state without sending zero-content emails.
- **D-Q2 — Run-now cadence ceiling.** When a user taps "Run now," how often is that allowed? Designer recommendation: no more than once per 4 hours per watch, surfaced as a "Already ran recently — next available in {N}h" inline message.
- **D-Q3 — Watch run scheduling cadence.** Weekly default — Architect to decide what local-time anchor (Monday 9am user-local? Brief 261 throttle window?) and what variance is acceptable.
- **D-Q4 — Implicit-signal weighting.** How heavily does a "saved 1 of 3" or "skipped digest" weight against an explicit "not a fit"? Architect to make ranking math call; designer's role is to ensure user-visible behaviour matches intuition.
- **D-Q5 — Auto-pause after consecutive failures.** Threshold N for auto-pause; designer recommends N=3 with silent at N=1, soft amber at N=2, auto-pause at N=3.
- **D-Q6 — Disclosure primitive site.** The disclosure for "near misses" is a UI-composition concern inside `watch-proposal-queue.tsx`, not a new ContentBlock schema primitive. Architect to confirm: either reuse an existing `CollapsibleBlock` if the 26-type union already has one, or use a UI-level `<details>`/`<summary>` (or equivalent) inside the queue component. **No schema addition required either way.**
- **D-Q7 — Mark Fulfilled outcome data shape.** "Marked fulfilled" should capture an outcome category (intro accepted · meeting booked · work / client / hire / partnership · other) — the same categories Brief 276 AC11a uses. Architect to align the schemas.
- **D-Q8 — Watch <> Brief 279 invitation candidate handoff.** When a watch surfaces a high-fit non-member, "Watch other person" should create an Invitation Candidate for Brief 279 operator review. The exact field-copy boundary (what travels from watch context to candidate) needs Architect spec.

---

## 23. Original-to-Ditto gaps

Where no existing UX pattern fits and the design is original:

- **"Quiet week" as a first-class state.** No mainstream product treats silence as a positive output. Closest analogue: human headhunter cadence. **Original to Ditto.**
- **"Held back for network-health reasons" collapsible.** No competitor exposes throttle decisions to the requester. Original — the design rationale is trust (Insight-167 lineage): if Ditto silently filters proposals, the user can't calibrate; if it filters loudly, it leaks the target's anti-persona. Collapsible is the middle path.
- **The combined "Curate panel for an agent process."** Most products expose settings as a forms page. Treating watch settings as a *Curate* job (Insight-238) — the user's continuous control over agent autonomy — is original to Ditto and consistent with Brief 285's Privacy Center.
- **Calibration phase + adaptive cadence-honesty.** "Send quiet-week digest for 3 weeks, then silence" is original — it pairs the early-relationship trust need with the long-run anti-spam principle.

---

## 24. Open questions for the human (post-review)

These are surfaces where the Architect's call may need human judgement:

- **OQ-1 — Outcome categories for "Mark fulfilled."** Should fulfilment require a category, or be optional? Required catches the economic-outcome data the brief calls out (AC16); optional reduces friction. Designer recommends *optional category + required short note*, but flagging for human.
- **OQ-2 — Cross-watch ranking learning.** If Lisa refines watch A ("more boutique"), should watch B benefit from the same refinement? Designer recommendation: **no by default**, with a one-line affordance after refinement: *"Apply this taste to your other watches?"* Human ratification needed because this is a privacy-adjacent decision.
- **OQ-3 — Should Background Watch surfaces appear in Brief 285's Privacy Center top-level navigation, or only under "Activity & Watches"?** Designer recommendation: top-level — Curate is a load-bearing job here, not a sub-tab.

---

## 25. Industry pattern survey — synthesis

Full survey at `docs/research/275-background-watch-network-health-ux-patterns.md`. Six pattern families surveyed: LinkedIn Job Alerts, Zillow/Redfin saved searches, Notion/Linear/Zapier/Google Alerts background automations, Apple News/Substack/Stratechery/Discover Weekly digest cadence, Pinterest/Goodreads/Spotify implicit feedback, and human headhunter / buyer-agent cadence.

**Five patterns directly informed this spec (citations follow each):**

1. **Criteria-as-explainability (Zillow/Redfin).** Every proposal card shows the specific health criteria it satisfies (already baked into Brief 274's `PossibleConnectionCard`); near-misses (§13) name the specific blocking criterion.
2. **Hard cap + fixed cadence + ritual framing (Stratechery / Discover Weekly).** Default cap of 3 proposals per Monday digest, stated upfront. Ritual framing in copy (§19).
3. **Implicit feedback first, optional reason picker second (Pinterest / LinkedIn).** Three-state dismiss (§14) with optional after-dismiss chip strip.
4. **Management-by-exception + ambient run history (Zapier / Linear / Google Alerts).** Watch runs invisibly (§16); only the digest and errors surface. The Status card's ambient health indicator (§9, §11) is always there for users who want to audit.
5. **"Nothing this week is context, not silence" (headhunter / Calm Technology).** Digest suppression + in-app health indicator + named near-misses, not "quiet week" emails (§11 revised).

**Two strong "do not copy" findings:**

- **Spotify Discover Weekly's zero in-product explainability.** Works for low-stakes music; wrong model for high-stakes professional connection. Ditto must always say *why this person*.
- **Zillow's "hide = permanent."** Right for real estate; wrong for relationships. Drove the three-state dismiss design in §14.

**One gap the survey identifies as original to Ditto:**

- **"Pause until a specific date / event."** No mainstream product offers this. Brief 275's pause durations (§15) — including *"until {Active Request resolved}"* — are original.

---

## 26. What this spec hands to the Architect

The Architect should use this spec + Brief 275 + the Researcher's technical findings (when run) to design:

1. The DB shape for `network_background_watches`, `network_watch_runs`, `network_watch_proposals`, `network_watch_feedback` — informed by the user-facing object decomposition in §5.
2. The `network-background-watch.yaml` process definition shape — informed by the lifecycle in §6 and the "process-as-primitive readability" in §20.
3. The engine functions (`network-background-watch.ts`, `network-health.ts`, `network-watch-digest.ts`) — implementing the 8 v1 network-health rules from Brief 275 with explainability copy from §13.
4. The HTTP routes (`/api/v1/network/watches/*`) — honouring the stepRunId / wrapper-run discipline from Brief 275's seam matrix.
5. The UI components (`watch-status.tsx`, `watch-proposal-queue.tsx`, settings panel additions to Privacy Center) — composing from existing ContentBlocks per §21.
6. The D-Q answers and OQ recommendations.

The Architect's brief synthesis pass turns this UX spec + technical research + Brief 275 into an implementation plan with concrete file diffs and acceptance test mappings.

---

## 27. What this spec does NOT decide

Per Designer skill contract (and Insight-024 cognitive separation):

- The DB shape and migration ordering.
- The engine ranking math (designer specifies what user sees, not the algorithm).
- Whether the watch runner is a new process YAML or extends `network-connecting.yaml` — though §20 prefers a distinct definition for L1 readability.
- The Brief 278 admin-observability surfaces in detail.
- The specific cron / scheduler implementation.
- The notification-throttle math inside `notifyUser`.

These are Architect / Builder decisions, informed but not constrained by this spec.

---

## 28. Designer self-review against `docs/review-checklist.md`

(Quick self-pass before the formal review agent.)

- [x] Six (→seven) human jobs explicitly mapped — §3
- [x] Persona test against all four personas — §2
- [x] Process-architecture (L1) readability addressed — §5, §20
- [x] Interaction states (loading/empty/partial/error/success) for each surface — §18
- [x] Progressive disclosure honoured (Rob mobile path, settings behind ⚙) — §8, §17
- [x] Implicit feedback preserved (edits are feedback) — §14
- [x] Copy guidance for the most distinctive moments (quiet weeks, refusals, failures) — §11, §13, §16, §19
- [x] Composition over invention — no new ContentBlock primitives required — §21
- [x] Mapping to existing primitives explicit — §21
- [x] Provenance for original patterns marked — §23
- [x] Open questions for Architect listed — §22
- [x] Open questions for human listed — §24
- [x] Reference docs check noted — §4
- [x] No technical design decisions made (Architect ruling deferred where appropriate)
- [x] No implementation code written (Builder territory)

---

*End of spec. Spawning Dev Reviewer next.*
