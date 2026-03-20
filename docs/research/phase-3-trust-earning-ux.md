# Phase 3: Trust Earning — UX Interaction Spec

**Date:** 2026-03-19
**Role:** Dev Designer
**Status:** Draft — pending review
**Inputs:** personas.md, human-layer.md, architecture.md, trust-earning-patterns.md, trust-visibility-ux.md, Insight-009, Insight-014, Insight-015

---

## The Core User Experience Insight

**Trust is invisible until it matters.**

Users don't think about trust. They review outputs, make corrections, approve quotes, edit descriptions. Trust accumulates silently from this natural behaviour. Trust only becomes *visible* at two moments:

1. **The upgrade suggestion** — "Your quoting process has earned less oversight. Accept?"
2. **The downgrade alert** — "Something changed. This process needs more oversight now."

Both moments are emotionally loaded. The upgrade is validating: "the system learned, I can let go." The downgrade is protective: "the system caught a problem before I did." If either feels wrong — too pushy, too jumpy, unclear — it damages the emotional journey described in personas.md.

**Design principle: Trust earning should feel like a relationship maturing, not a settings page being configured.**

---

## Which Human Jobs Does Trust Earning Serve?

| Job | How trust earning relates | When |
|-----|--------------------------|------|
| **Orient** | "How reliable is this process?" — trust data appears naturally in Process Card, Daily Brief | Every day (passive) |
| **Review** | Every review action (approve/edit/reject) IS the trust-building act — the user is already doing it | Every review (implicit) |
| **Delegate** | "Should I change oversight for this process?" — the trust upgrade/downgrade decision | Rare: weeks or months apart |
| **Delegate** | "Should I change oversight for this process?" — accepting/rejecting upgrade suggestions | When suggestion appears |

**Key finding:** Trust earning is primarily a **background process** that surfaces through existing primitives. Phase 3 does NOT need a new primitive. It enriches existing ones: Process Card (trust data), Daily Brief (trust milestones), Trust Control (upgrade decisions), and Feedback Widget (teaching moments).

---

## How Each Persona Experiences Trust Earning

### Rob — Trades MD (phone between jobs)

**Rob's trust journey is the canonical path. If it works for Rob, it works for everyone.**

**Week 1-3 (Supervised):**
Rob reviews every quote on his phone. He approves most. He corrects 3 bathroom labour estimates. He doesn't think about "trust" — he thinks about quotes. The system is learning from his corrections, but Rob doesn't know or care about that yet.

**What Rob sees (in existing primitives):**
- **Review Queue (mobile):** Each quote for review. Same as today — no trust UI needed yet.
- **Feedback Widget:** After correcting the 3rd bathroom estimate: "You've corrected bathroom labour estimates 3 times. Always adding 2 hours. Teach this?" Rob taps yes. This is the "Teach this" moment from human-layer.md. **Phase 3 adds the trust data underneath, but Rob only sees the correction pattern.**

**Week 4 — The upgrade moment:**
Rob gets a notification on his phone. This is the first time trust becomes visible.

```
Trust upgrade suggestion — Quoting Process

Your quoting process has been running for 5 weeks.
34 quotes. 31 approved clean. 3 corrected (all bathroom
labour — now fixed). Last 15 quotes: all approved clean.

The system recommends: Spot-checked
You'd review ~1 in 5 quotes instead of every one.
Quotes you don't review still go through the automated
checks (pricing validation, margin check, spec test).

If the correction rate rises above 30%, the process
automatically returns to Supervised.

                    [Accept]  [Keep reviewing all]
```

**Why this works for Rob:**
- **Plain language** — no "trust tier" jargon. "Review ~1 in 5" is concrete.
- **Evidence first** — Rob sees his own data before the suggestion.
- **What changes + what stays** — Rob knows automated checks still run.
- **Safety net visible** — auto-downgrade is stated upfront so Rob knows he's not "turning off" oversight.
- **Two-tap decision** — Accept or Keep. No configuration. Rob does this at a red light (he shouldn't, but he will).

**What Rob does NOT see:**
- Trust scores, Beta distributions, Wilson intervals
- Multi-source signal weighting
- Aggregation algorithms
- "Earned Data" tables with approval rates
- Any settings page

**Rob's mental model:** "The system is asking if I trust it enough to check less. Here's the evidence. Yes or no."

### Lisa — Ecommerce MD (desk + commute)

**Lisa's trust journey adds the "Teach this" → trust pipeline.**

**Week 2-3 (Supervised):**
Lisa reviews product descriptions. She keeps adding the material source country and sustainability angle. The Feedback Widget detects the pattern and offers "Teach this."

**What's different from today:** After Lisa taps "Teach this," the trust system records: the process now enforces this pattern via spec-testing. This means future descriptions are checked for sustainability angle BEFORE reaching Lisa. The trust data captures: "spec-testing pass rate for sustainability criterion: 100% since it was taught." This is a trust signal that Lisa never directly sees — but it feeds the upgrade eligibility calculation.

**Lisa's upgrade moment (Week 4):**
Same pattern as Rob, but Lisa sees it on her laptop during her morning desk time. The evidence includes her specific corrections: "You taught the system 2 patterns (sustainability angle, material source). Both are now enforced automatically. Last 20 descriptions: 19 approved clean, 1 corrected (non-pattern issue)."

**Lisa's "What would change" concern:** Lisa worries about brand voice. She wants to know: "If I review fewer descriptions, will the quality drop?"

Phase 3 should answer this with simulation (from the research's GitHub Rulesets "evaluate mode" pattern): "Of the last 20 descriptions, if you had been at spot-checked, 16 would not have been reviewed. All 16 passed brand voice check and spec-testing. 0 would have needed correction."

**This is the strongest UX pattern from the research — and it directly serves Lisa's anxiety.**

### Jordan — Generalist Technologist (desk, demos to leadership)

**Jordan's trust journey adds the cross-process and demonstration angle.**

Jordan has 4 processes across 3 departments. Trust earning matters to Jordan not as a personal experience but as **evidence of organisational value.** Jordan needs to show leadership: "Here's proof these processes are working well enough to reduce oversight."

**What Jordan needs that the current design doesn't provide:**

1. **Trust summary across processes** — "3 of 4 processes are at spot-checked. 1 is still supervised (Finance reconciliation — correction rate is still 22%)." This belongs in the **Daily Brief** as a process health summary, and in the **Process Card** grid view.

2. **Trust progression over time** — A sparkline or simple chart showing: correction rate declining over weeks. Jordan shows this in the leadership meeting. This is the **Performance Sparkline** attached to trust metrics.

3. **Department-level view** — Jordan presents trust data per department, not per process. "HR's processes are all at autonomous. Finance is still at supervised." This is a future view (not Phase 3 scope) but the data model should support it.

**Jordan's trust decision is delegated.** Jordan may accept an upgrade suggestion on behalf of a department head: "The HR reference process has earned autonomous. I'll accept this and show Maria the evidence." The Trust Control needs to record who accepted, supporting Jordan's governance role.

### Nadia — Team Manager (desk + mobile standup prep)

**Nadia's trust journey adds the team governance dimension.**

Nadia doesn't manage one process — she governs trust across her team's processes. Each analyst has a formatting process. Some earn trust faster than others.

**Nadia's morning brief (mobile, before standup):**

```
TEAM TRUST HEALTH
4 formatting processes running

Chen's formatting:    Autonomous  ● 95% clean
Priya's formatting:   Spot-checked ● 88% clean
Alex's formatting:    Supervised   ● 71% clean ↑ improving
Sam's formatting:     Spot-checked ● 91% clean

Suggestion: Priya's process → Autonomous (eligible)
Action needed: Alex's process has improved — review in 2 weeks
```

**What Nadia sees that others don't:**
- **Team-level trust aggregation** — not just individual processes but patterns across her team
- **Comparative view** — Chen's process is at 95% while Alex's is at 71%. Nadia uses this in coaching.
- **Delegation cascade** — Nadia accepts Priya's upgrade but keeps Alex's at supervised. Different processes, different trust, same governance authority.

**Nadia's governance concern:** Can Alex's process game trust by producing only easy formatting jobs? The system should show Nadia: "Alex's process handled 12 jobs this window. Job complexity distribution: 3 simple, 6 medium, 3 complex. Similar to team average." This prevents trust inflation (from the gaming prevention research).

---

## Interaction Patterns for Trust Earning

### Pattern 1: The Upgrade Suggestion (Decide job)

**Trigger:** System determines a process is eligible for trust upgrade.

**Where it appears:**
- **Push notification** (mobile) — "Your quoting process has earned less oversight. Tap to review."
- **Daily Brief** (Orient) — listed as a decision item: "Decide: Trust upgrade available for Quoting"
- **Process Card** (Orient) — badge or indicator on the process card in the grid
- **Trust Control** (Delegate/Decide) — full detail when the user navigates to it

**The interaction flow:**

```
Step 1: Notification or Brief item catches attention
   → User taps / clicks to see details

Step 2: Upgrade proposal (the screen Rob sees above)
   Shows: evidence, what changes, safety net

Step 3: Decision
   → [Accept] → tier changes immediately, activity logged
   → [Keep current] → suggestion dismissed, re-evaluated next window
   → [Tell me more] → expands to show simulation data

Step 4: Confirmation
   → "Quoting process is now at Spot-checked.
      You'll review ~20% of quotes. Automated checks
      continue on all quotes. If correction rate exceeds
      30%, the process returns to Supervised automatically."
```

**Interaction states:**

| State | What the user sees |
|-------|-------------------|
| No suggestion available | Trust Control shows current tier + earned data. No action needed. |
| Suggestion available, not yet seen | Badge on Process Card. Item in Daily Brief. Push notification (if enabled). |
| Suggestion viewed | Evidence + proposal + [Accept] / [Keep current] / [Tell me more] |
| Suggestion accepted | Confirmation message. Activity Feed entry. Process Card updated. |
| Suggestion dismissed | Disappears. Re-evaluated at next window. Activity Feed entry. |
| Upgrade applied, then auto-downgrade triggered | Alert notification: "Quoting process returned to Supervised. Correction rate reached 35% over last 10 runs. [View details]" |

### Pattern 2: The Auto-Downgrade Alert (Orient + Decide jobs)

**Trigger:** Downgrade threshold crossed (correction rate, error rate, or downstream rejection).

**This is a critical trust moment.** If the downgrade catches a real problem, the user thinks: "The system is watching out for me — good." If it feels like a false alarm, the user thinks: "This is too jumpy — I'll override."

**Where it appears:**
- **Push notification** — "Your quoting process needs more oversight. Correction rate reached 35%."
- **Daily Brief** — priority item: "Alert: Quoting process auto-downgraded to Supervised"
- **Activity Feed** — logged as a system action with full details
- **Process Card** — status changes, shows downgrade indicator

**The interaction flow:**

```
Step 1: Alert arrives (push notification or Daily Brief)

Step 2: Detail view
   "Quoting Process — Trust Downgrade

   Previous: Spot-checked → Now: Supervised

   What happened:
   Of the last 10 runs, 4 needed correction (40%).
   Threshold was 30%.

   Corrections were:
   - Run #47: Labour estimate too low (complex bathroom)
   - Run #48: Wrong margin applied (commercial vs residential)
   - Run #50: Missing materials for water heater
   - Run #51: Labour estimate too low (outdoor work)

   This means: You'll review every quote until the
   correction rate improves.

   [View correction details]  [Override — keep spot-checked]"

Step 3: User decides
   → Review details to understand what went wrong
   → Accept the downgrade (default, safe choice)
   → Override if they believe the corrections were edge cases
```

**The override option is important.** Sometimes the user knows something the system doesn't: "Those 4 corrections were all from one unusual job. The process is fine." The override should be easy but recorded — it's a governance signal. (From the research: Google Binary Authorization's break-glass pattern — override always possible, always recorded.)

**What the user should NOT see:** A sudden change with no explanation. Every downgrade must say WHY in concrete terms (which runs, what was wrong), not just "correction rate exceeded threshold."

### Pattern 3: Trust Building Through Review (Review job — implicit)

**This is not a new interaction.** The user is already reviewing outputs. Trust earning happens silently underneath. But Phase 3 adds subtle enrichments to existing review interactions:

**After approving an output:**
The Feedback Widget could show (optionally, not intrusively):
```
"✓ Approved. Trust data: 15 of 17 recent quotes approved clean."
```
This is a one-line status, not a dialog. It reinforces that reviews are building trust. **Design question for the Architect:** Is this too noisy? Should it only appear occasionally (e.g., every 10th approval)? Or never — let trust be fully invisible until the upgrade suggestion?

**After editing an output:**
The existing Feedback Widget flow: shows diff, offers "Teach this." Phase 3 adds: the edit severity (minor formatting vs major rewrite) affects trust differently, but the USER DOESN'T SEE THIS. The severity classification is internal. The user sees the diff and the "Teach this" option — same as before.

**After rejecting an output:**
```
"Output rejected. The system will return to reviewing all
outputs for this process. [Add comment — what went wrong?]"
```
A rejection could trigger immediate downgrade to supervised (if at a higher tier). The comment is optional but strongly encouraged — it feeds the correction pattern extraction pipeline.

### Pattern 4: Trust Simulation ("What Would Change?")

**This is the strongest new interaction from the research.** Before accepting an upgrade, the user can see: "What would have happened at the new tier?"

```
"If Quoting had been at Spot-checked for the last 20 runs:

  16 quotes would NOT have been reviewed by you
  Of those 16:
    ✓ 15 passed all automated checks and were correct
    ⚠ 1 had a minor pricing discrepancy (within 2% tolerance)
    ✗ 0 had issues that needed your correction

  4 quotes WOULD have been randomly sampled for your review
  Of those 4:
    ✓ 4 were approved clean by you

  Result: No corrections would have been missed."
```

**Why this matters:** This directly addresses the anxiety behind Problem 1 from personas.md ("I can't delegate because nothing is reliable enough"). The simulation shows concrete evidence: "If we had trusted the system more, nothing would have gone wrong." Or, if something would have been missed: "2 corrections would have been missed — consider keeping the current tier."

**Where this appears:** Inside the Trust Control when the user taps "Tell me more" on an upgrade suggestion. NOT shown proactively (too much information for casual review). Available on demand for users who want evidence before deciding.

---

## Primitives Affected by Phase 3

| Primitive | What Phase 3 adds | Priority |
|-----------|-------------------|----------|
| **Trust Control (#11)** | Upgrade suggestion flow, simulation data, downgrade history, override option | Core — must be designed |
| **Process Card (#2)** | Trust tier badge, trust health indicator, upgrade-available badge | Core — enrichment |
| **Daily Brief (#1)** | Trust milestones as decision items, downgrade alerts as priority items, team trust health (Nadia) | Core — enrichment |
| **Feedback Widget (#7)** | Edit severity classification (internal), "Teach this" → trust pipeline | Core — enrichment |
| **Activity Feed (#3)** | Trust change events (upgrade, downgrade, override) as activity entries | Core — enrichment |
| **Performance Sparkline (#4)** | Trust metrics (correction rate, approval rate) as sparkline-able values | Enhancement |
| **Review Queue (#5)** | Optional: approval count / trust status one-liner after review actions | Nice-to-have |

**No new primitives needed.** Trust earning enriches existing ones.

---

## Process Architecture: Trust-Affecting Actions

From the user's perspective, these are the actions that affect trust. The user should understand (at a glance, not in detail) which actions build trust and which erode it:

| User action | Trust effect | User visibility |
|-------------|-------------|-----------------|
| Approve output | Positive | Invisible (natural behaviour) |
| Edit output (minor) | Slightly positive (mostly right) | Invisible (existing Feedback Widget) |
| Edit output (major) | Negative | Invisible (severity is internal) |
| Reject output | Strongly negative | Feedback Widget: "rejected, returning to supervised" |
| "Teach this" | Indirectly positive (creates spec-test, improves future outputs) | Visible (existing pattern) |
| Accept upgrade | Positive (user trusts the system) | Visible (Trust Control) |
| Override downgrade | Neutral (recorded, no trust change) | Visible (Trust Control) |
| Auto-approve similar (from Review Queue) | Strongly positive (user trusts a class of outputs) | Visible (existing pattern in Review Queue) |

**Design question for the Architect:** Should the user ever see a "trust score"? Rob and Lisa should not — they think in concrete terms ("31 of 34 approved clean"). Jordan and Nadia might want a score for reporting. Possible approach: show the underlying data (approval rate, correction rate, runs completed) but never a synthetic score. The score is internal.

---

## Gaps Between Research and Current Human-Layer Design

### Gap 1: No Simulation / "What Would Change" in Trust Control Wireframe

The current Trust Control wireframe (human-layer.md, Primitive 11) shows earned data and a system recommendation. It does NOT show simulation: "what would have happened at the new tier." The research (GitHub Rulesets evaluate mode) found this is the strongest pattern for trust decisions.

**Recommendation:** Add a "Tell me more" expansion to the Trust Control that shows simulation data. Not shown by default — available on demand.

### Gap 2: No Trust Budget / Burn Rate Visualisation

The research found the SLO error-budget metaphor (Grafana/Datadog) maps to trust: "trust budget remaining before auto-downgrade." The current Trust Control shows auto-downgrade triggers but not proximity to them.

**Recommendation:** Add a simple indicator: "Correction rate: 17% (downgrade at 30%)" or a visual bar showing how close to the threshold. Not a full SLO dashboard — just enough for the user to know: "am I close to losing trust?"

### Gap 3: No Team-Level Trust Health (Nadia's View)

The current design has no team-level trust aggregation. Nadia sees individual Process Cards but no cross-process trust comparison.

**Recommendation:** For Phase 3, this could be as simple as a section in the Daily Brief: "Team trust health: 3 processes at autonomous, 1 at supervised." Full team dashboard is Phase 9.

### Gap 4: No Peer/Cross-Process Comparison

The eBay research found peer comparison valuable ("your defect rate vs similar sellers"). Agent OS could compare: "Your quoting process correction rate (12%) is lower than average for similar processes (18%)."

**Recommendation:** Defer to Phase 9. Not enough data or processes during dogfood to make this meaningful.

### Gap 5: Trust Data Not in Daily Brief

The current Daily Brief wireframe shows process health but not trust milestones. When a process becomes eligible for upgrade, or when a downgrade happens, these should appear as priority items.

**Recommendation:** Add trust events to the Daily Brief:
- "Decide: Quoting process eligible for trust upgrade"
- "Alert: Invoicing process auto-downgraded (correction rate 35%)"

### Gap 6: No "Requirements Preview" for Upgrades

The Stripe capabilities pattern shows what obligations come WITH an upgrade. The current Trust Control shows auto-downgrade triggers, but not proactively before the user accepts.

**Recommendation:** The upgrade proposal should explicitly state: "If you upgrade to Spot-checked, these auto-downgrade rules will be active: [list]." This is in the wireframe for the Trust Control but not in the upgrade suggestion flow.

### Gap 7: Human-Reviewer Agreement Not Captured

Insight-009 flags this as a critical gap. When the user approves something the maker-checker flagged, that's a dual signal: the output was probably fine (positive for producer) AND the reviewer was too strict (calibration signal for reviewer).

**UX implication:** When the user approves a flagged output, the Feedback Widget could optionally ask: "The reviewer flagged this but you approved it. Was the flag helpful?" [Yes, I checked because of it] [No, it was fine] [Dismiss]. This captures the human-reviewer agreement signal.

**Design question:** Is this too noisy? Alternative: capture the agreement/disagreement silently (the user approved despite a flag — that's a data point) without asking. The "silent capture" approach preserves implicit feedback design (edits ARE feedback → agreement IS feedback).

---

## Mobile Considerations (Insight-015)

Trust earning interactions mapped to mobile/desktop:

| Interaction | Mobile | Desktop |
|-------------|--------|---------|
| Receive upgrade suggestion notification | Yes — push notification | Yes — Daily Brief |
| View upgrade evidence | Yes — simple card view | Yes — full Trust Control |
| Accept/Keep upgrade | Yes — two buttons | Yes — same |
| View simulation ("Tell me more") | Simplified — key numbers only | Full — detailed run-by-run |
| Receive downgrade alert | Yes — push notification | Yes — Daily Brief + Activity Feed |
| View downgrade details | Simplified — "4 of 10 corrected" | Full — individual run details |
| Override downgrade | Yes — but with confirmation ("Are you sure?") | Yes |
| Review output (the trust-building action) | Yes — for simple approvals | Yes — for edits and complex review |

**Rob's critical path:** Upgrade suggestion arrives as push notification → Rob opens on phone → sees evidence (one screen) → taps Accept → done. This entire flow must work in under 60 seconds on a phone.

---

## Multi-Source Trust Signals at Higher Tiers

**At spot-checked and autonomous tiers, human review is sparse.** At spot-checked, the user reviews ~20% of outputs. At autonomous, they review nothing unless flagged. So what sustains or erodes trust when the human isn't reviewing?

The Trust Control must show non-human trust signals clearly:

```
TRUST DATA — Quoting Process (Spot-checked)

Human reviews:    4 of 20 runs reviewed (20% sample)
                  4 approved clean ✓

Automated checks: 20 of 20 runs passed all checks
                  Pricing validation: 20/20 ✓
                  Margin check: 19/20 ✓ (1 warning, within tolerance)
                  Spec testing: 20/20 ✓

Script steps:     20 of 20 passed ✓

Overall:          No corrections needed. All signals healthy.
```

**The user's mental model should be:** "Even when I'm not reviewing, the system is checking. Here's what the checks found." This directly serves the "Know it's working when I'm not looking" JTBD from personas.md.

**Design question for the Architect:** How much automated-check detail should be visible? Rob doesn't care about "spec testing: 20/20." He cares about "everything checked out." Lisa might care about "brand voice check: 20/20." The level of detail may need to be persona-adaptive or simply progressive-disclosure (collapsed by default, expandable).

---

## Trust Earning at Single-Process Scale (Insight-014)

Trust earning is fully functional and valuable with a single process. Rob's path is the canonical experience: one quoting process, earning trust over weeks, upgrade suggestion, accept or keep.

Team trust health (Nadia's view) is an **additive enrichment** that appears only when multiple processes exist. It must never be required for trust earning to function. Nadia's Daily Brief section about team trust health only renders when she has multiple processes with trust data.

---

## Simulation as a System Capability

The trust simulation ("What Would Change?") is not just a UI feature — it requires system capabilities:
- **Deterministic sampling replay** — the ability to retroactively determine which runs would have been sampled at a different tier (the existing SHA-256 sampling hash makes this possible)
- **Retroactive quality evaluation** — assessing whether non-reviewed outputs would have needed correction (this can use existing harness decision records — if the output passed all automated checks AND was approved when sampled, it's "would have been fine")
- **Historical context storage** — enough data already exists in `harnessDecisions` and `stepRuns` to power this

The Architect should assess feasibility, but the existing data model likely supports simulation without new storage.

---

## Missing Interaction States

### Re-Offered Suggestion

When an upgrade suggestion was previously dismissed and becomes eligible again:

```
Trust upgrade suggestion — Quoting Process

Previously suggested on Mar 5 — you chose to keep
reviewing all quotes.

Since then: 12 more quotes. All approved clean.
Total evidence: 46 quotes, 43 approved clean (93%).

[Accept upgrade]  [Keep reviewing all]
```

Shows accumulated evidence since last dismissal. Not identical to first offer.

### Post-Override Behaviour

When the user overrides a downgrade:

- Monitoring continues at the current (higher) tier
- If the correction rate stays above threshold for another evaluation window, the system re-triggers the downgrade alert
- After 3 consecutive overrides, the alert escalates: "You've overridden 3 downgrades. Correction rate has remained above 30% for 6 weeks. The system recommends supervised. [Accept] [Override — I understand the risk]"
- This is the "break-glass" pattern from the research — always possible, always recorded, but friction increases with repeated overrides

---

## Authority for Trust Decisions

**Design question for the Architect:** Who can accept a trust upgrade?

- **Process owner only** — simplest model, works for Rob and Lisa
- **Process owner + delegated authority** — needed for Jordan (accepts on behalf of department heads) and Nadia (governs team processes)
- **Approval chain** — trust upgrade for critical processes requires a second approver (governance pattern from Paperclip)

For Phase 3 (dogfood), "process owner only" is likely sufficient. Delegated authority is Phase 4+ when multi-user governance is implemented.

---

## Design Questions for the Architect

1. **Should trust scores be visible?** Concrete data (approval rate, correction count) vs synthetic score (0.73). Recommendation: show data, hide score — but the Architect should decide.

2. **How often should the system check upgrade eligibility?** After every run? Weekly? When the user opens Trust Control? Continuous checking means the suggestion appears as soon as eligible. Periodic checking means it batches with the Daily Brief.

3. **Should edit severity (minor vs major) be visible to the user?** The research suggests classifying edits internally. Should the user see "minor correction" vs "major rewrite" labels? Or is that system internals leaking into UX?

4. **Silent vs explicit human-reviewer agreement capture.** The user approves a flagged output. Do we ask them about the flag (explicit) or just record the disagreement (implicit)? The design philosophy says "edits ARE feedback" — analogously, "agreement IS feedback" — suggesting the silent approach.

5. **Grace period UX.** The Discourse research found a 2-week grace period after earning TL3 to prevent oscillation. If a process upgrades to spot-checked and immediately gets 2 corrections, do we downgrade immediately or wait? The grace period needs UX: should the user know about it?

6. **Trust budget language.** "Correction rate: 17% (downgrade at 30%)" vs "Trust budget: 57% remaining" vs no proximity indicator. The error-budget metaphor is powerful but adds cognitive load. Is it too much for Rob?

7. **Nadia's team view scope.** Is team-level trust health Phase 3 or Phase 9? The data exists once trust is computed — the question is whether the Daily Brief should aggregate it now.
