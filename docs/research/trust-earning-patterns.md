# Research Report: Trust Earning Patterns for Phase 3

**Date:** 2026-03-19
**Research question:** How do existing systems handle trust accumulation, feedback weighting, sliding windows, and tier upgrade/downgrade? What can Agent OS build from?
**Research question (expanded):** Additionally: how do systems aggregate trust signals from multiple sources? How do they handle human-reviewer disagreement? How do they present trust to users? How do they prevent gaming?
**Status:** Complete (2nd pass) — pending review

---

## 1. Cost & Decision Accumulation (Paperclip)

**Source:** `paperclipai/paperclip`

### Event-Sourced Cost Model

Paperclip tracks costs as immutable events in a `costEvents` table. Spend totals are computed at query time by summing events within time windows. Key data structure:

```
costEvents {
  agentId, provider, model,
  inputTokens, outputTokens, costCents,
  occurredAt (timestamp)
}
```

**Window calculation:** Current UTC month (first day to first day of next month). Aggregation methods return spend by agent, provider, project, or model. Rolling windows: last 5h, 24h, 7d.

**Relevance to Agent OS:** The event-sourced pattern — append-only events, compute aggregates at query time — maps directly to trust data accumulation. Trust events (approve/edit/reject) would be the equivalent of cost events.

### Two-Threshold Budget System

Paperclip uses a two-threshold model for budget enforcement:

| Threshold | % of budget | Action |
|-----------|------------|--------|
| Soft (warn) | 80% (configurable) | Notify, log incident |
| Hard (stop) | 100% | Pause agent, create approval for override |

Budget policies are scoped at three levels: company, project, agent. Incidents are tracked as records (`budgetIncidents` table) linked to the policy that triggered them.

**Relevance to Agent OS:** The two-threshold pattern could apply to trust downgrades — a "warn" threshold that surfaces a concern vs a "hard" threshold that triggers automatic downgrade.

### Approval as Decision Record

```
approvals {
  type, status (pending/approved/rejected/cancelled),
  payload (json), decisionNote,
  decidedByUserId, decidedAt
}
```

State transitions are idempotent. Every approval decision creates an activity log entry. Approvals support comment threads for async discussion before decision.

**Relevance to Agent OS:** Trust upgrade suggestions could use this pattern — the system proposes, the human decides (approve/reject), the decision is recorded with reasoning.

### Configuration Rollback

Paperclip stores agent config revisions as immutable snapshots (`agentConfigRevisions`). Rollback creates a NEW revision rather than deleting history. Each revision records `changedKeys`, `beforeConfig`, `afterConfig`, and `source` ("patch" or "rollback").

**Relevance to Agent OS:** Trust tier changes should be recorded as immutable revisions with before/after state, enabling rollback and audit.

---

## 2. Reputation & Trust Tier Systems (Landscape Scan)

### Sliding Window Patterns

**Two dominant approaches found:**

**A. Fixed window with implicit decay**
- **Discourse TL3:** Rolling 100-day window. Activity counts fully if within window, zero if outside. No gradual decay. 2-week grace period after earning TL3 prevents oscillation.
- **eBay:** Adaptive window — 3-month if >400 transactions, else 12-month lookback. Evaluation monthly on the 20th.

**B. Exponential aging with decay factor**
- **Beta Reputation System (Josang & Ismail 2002):** `alpha_new = lambda * alpha_old + positive_events`, `beta_new = lambda * beta_old + negative_events`. Lambda controls decay: 1.0 = no decay, 0.9 = 10% per period. After extended inactivity, system naturally returns toward uniform prior (complete uncertainty).

**Agent OS mapping:** Fixed windows are simpler to implement and explain. Exponential aging provides smoother transitions. Both are viable; the choice depends on whether we want "your last N runs" or "all runs, weighted by recency."

### Concrete Tier Thresholds

**eBay Seller Levels (3 tiers):**

| Metric | Below Standard | Above Standard | Top Rated |
|--------|---------------|----------------|-----------|
| Transaction defect rate | >2% | ≤2% | ≤0.5% |
| Late shipment rate | — | — | ≤3% |
| Min sales history | — | — | 100 txns + $1,000 |
| Min account age | — | — | 90 days |

Upgrade: must meet ALL criteria (conjunctive). Downgrade: failing ANY single metric triggers it (disjunctive).

**Discourse Trust Levels (5 tiers):**

| Level | Key requirements | Demotion? |
|-------|-----------------|-----------|
| TL0 (New) | Automatic | Never |
| TL1 (Basic) | 5 topics, 30 posts read | Never |
| TL2 (Member) | 15 days visited, 20 topics | Never |
| TL3 (Regular) | 50% of days visited, 10 replies, 25% posts read (100-day window) | **Yes — auto-demoted** |
| TL4 (Leader) | Manual staff only | Manual only |

Key insight: only the highest earned tier (TL3) allows demotion. Lower tiers are ratchets — once earned, never lost.

**Stack Overflow:**
- Point-based with privilege thresholds (15 to upvote, 2,000 to edit without approval, 20,000 for "trusted user")
- Daily cap of +200 rep prevents gaming
- Different actions contribute different point values (+10 for answer upvote, -2 for downvote received, +2 for approved edit)

### Upgrade/Downgrade Asymmetry

Every system observed treats upgrades and downgrades asymmetrically:
- **Upgrades** require sustained performance over time (100 transactions, 100 days, etc.)
- **Downgrades** can be triggered by crossing a single threshold
- **Grace periods** prevent oscillation at boundaries (Discourse: 2 weeks)

### Cold Start Handling

| System | Approach |
|--------|----------|
| Beta Reputation | Prior Beta(1,1) = complete uncertainty. Expected value starts at 0.5 |
| Wilson Score | Small sample naturally penalised — lower bound of CI is very low |
| eBay | 90-day min + 100 transactions for Top Rated |
| Discourse | Auto-promote first 50 users on new instance |
| Stack Overflow | Association bonus (+100) from linked sites |

**Agent OS mapping:** New processes start supervised (the cold-start tier). This is equivalent to eBay's minimum history requirement — you can't upgrade until you have enough data.

---

## 3. Feedback Weighting: The Beta Reputation System

**Source:** Josang & Ismail 2002, implemented in `eigen-trust/eigen-trust` (Rust)

The Beta system models reputation as `Beta(alpha, beta)` where:
- `alpha = positive_events + 1` (prior)
- `beta = negative_events + 1` (prior)
- Expected value: `E = alpha / (alpha + beta)`

**Weighting different feedback types:** The system is symmetric by default (1 positive = 1 negative). To weight differently, contribute multiple "units" per event:

| Agent OS feedback | Possible weight (units) |
|-------------------|------------------------|
| Clean approval | +1 positive |
| Minor edit (editRatio < 0.2) | +0.5 positive (mostly right) |
| Major edit (editRatio > 0.5) | +1 negative (substantially wrong) |
| Rejection | +2 negative |

**Decay:** `alpha_new = lambda * alpha_old + new_positive`, `beta_new = lambda * beta_old + new_negative`. Extended inactivity returns toward Beta(1,1) (uncertainty).

**Wilson Score Interval (alternative):**
Lower bound of confidence interval for binomial proportion. Used by Reddit. Formula handles small samples naturally — items with few ratings get wide confidence intervals, pushing the lower bound toward zero. Prevents "1 approval, 0 rejections = 100% trust."

**Agent OS mapping:** Both systems work. Beta is more intuitive for continuous trust scoring. Wilson is better for "is this process trustworthy enough to upgrade?" threshold decisions. Could use Beta for running score + Wilson for upgrade eligibility.

---

## 4. Edit Diffs as Trust Signal

### Diff Storage

**Recommended format (jsdiff change objects):**

```typescript
{
  original: string,       // full original output
  edited: string,         // full edited output
  changes: Array<{ value: string, added?: boolean, removed?: boolean, count: number }>,
  stats: { wordsAdded: number, wordsRemoved: number, wordsUnchanged: number }
}
```

**Source:** `kpdecker/jsdiff` — multi-granularity diffs (chars, words, lines, sentences). Word-level is the right granularity for correction pattern detection.

### Edit Severity Classification

Two-layer approach:

1. **Quantitative:** `editRatio = (wordsAdded + wordsRemoved) / (wordsAdded + wordsRemoved + wordsUnchanged)`. Range 0.0–1.0.
2. **Qualitative classification:**

| editRatio | Classification | Trust signal |
|-----------|---------------|-------------|
| 0 | Clean approval | Positive |
| < 0.1 | Formatting/typo | Weakly positive |
| 0.1–0.3 | Correction | Neutral to weakly negative |
| 0.3–0.6 | Revision | Negative |
| > 0.6 | Rewrite | Strongly negative |

**Sources:**
- `wikimedia/revscoring` — token-category feature extraction classifies changed tokens by type (structural, numeric, semantic, lexical)
- `collaborativeTrust/WikiTrust` — edit distance computation with component-based scoring (insertions/deletions + movements)
- `chrisjbryant/errant` — typed correction classification (grammatical error taxonomy)

### Edit-as-Trust-Signal: WikiTrust Algorithm

**Source:** `collaborativeTrust/WikiTrust` (`analysis/computerep.ml`)

The gold standard for turning edits into trust scores. For three consecutive versions (v0, v1, v2):

```
quality = min(1.0, (d02 - d12) / d01)
```

Where `d` is edit distance between versions. This measures: **did the edit move the text closer to what the next editor kept?**

- New text gets initial trust = `author_reputation * trust_coeff_lends_rep`
- Text that **survives subsequent edits** gains trust
- The judge's weight is `log(1.0 + reputation)` — more reputable judges have more impact

**Agent OS mapping:**
- **Clean approval** = agent output survived review = trust-positive (equivalent to WikiTrust's "text survived editing")
- **Minor edit** = small `d01` = mostly right, moderate positive signal
- **Major rewrite** = large `d01` = substantially wrong, negative signal
- **Rejection** = no salvageable output, strongest negative signal

### Correction Pattern Extraction

**No open-source system implements the full pipeline Agent OS needs.** Individual components exist:
- `chrisjbryant/errant` — typed correction classification (grammar-specific)
- `grammarly/gector` — token-level transformation tags
- `wikimedia/revscoring` — feature vector extraction from diffs
- Agent OS ADR-003 — LLM-based reconciliation (send original + diff + existing memories to LLM → returns ADD/UPDATE/DELETE/NONE operations)

**Gap confirmed:** "Correction pattern extraction from diffs" is Original to Agent OS (ADR-003 provenance table). No system combines structured diff storage → pattern extraction → memory injection → trust scoring.

---

## 5. Existing Data Structures in Agent OS

### What's already built (Phase 2):

| Component | Table/File | Status |
|-----------|-----------|--------|
| Trust tier per process | `processes.trustTier` | Static — set in YAML |
| Trust data field | `processes.trustData` (json) | Empty — reserved for Phase 3 |
| Feedback records | `feedback` table (type, diff, comment, correctionPattern) | Schema exists, CLI `capture` works |
| Harness decisions | `harnessDecisions` table | Records every trust gate decision |
| Activity log | `activities` table | Logs all state changes |
| Memory from feedback | `createMemoryFromFeedback()` | Creates correction memories on edit/reject |
| Trust gate | `trust-gate.ts` | Enforces 4 tiers, deterministic sampling |

### What Phase 3 needs to add:

| Component | Gap |
|-----------|-----|
| Trust event recording | Needs a table or use existing `feedback` + `harnessDecisions` |
| Trust score computation | Needs algorithm (Beta, Wilson, or custom) |
| Window/decay mechanism | Needs sliding window or exponential aging |
| Edit severity calculation | Needs diff analysis (jsdiff) on edit feedback |
| Upgrade eligibility check | Needs thresholds + minimum history requirements |
| Downgrade trigger | Needs error rate / correction rate thresholds |
| Trust tier change history | Needs immutable revision log (Paperclip pattern) |
| Upgrade suggestion → human decision | Needs proposal + approval flow |

---

## 6. Summary: Patterns Available to Build From

| Pattern | Source | Agent OS applicability |
|---------|--------|----------------------|
| Event-sourced accumulation | Paperclip `costEvents` | Trust events as append-only records |
| Two-threshold warn/stop | Paperclip `budgetPolicies` | Downgrade: warn threshold + hard threshold |
| Approval as decision record | Paperclip `approvals` | Upgrade suggestions as proposals |
| Config revision audit trail | Paperclip `agentConfigRevisions` | Trust tier change history |
| Fixed sliding window | Discourse TL3 (100 days) | "Last N runs" window |
| Exponential decay | Beta Reputation System | Weighted recency |
| Beta distribution scoring | Josang & Ismail 2002 | Continuous trust score from feedback |
| Wilson score interval | Reddit/Evan Miller | Upgrade eligibility with small-sample safety |
| Conjunctive upgrade / disjunctive downgrade | eBay | Upgrade needs ALL criteria; downgrade on ANY |
| Grace period | Discourse (2 weeks) | Prevent oscillation at tier boundaries |
| Word-level diff with change objects | jsdiff | Structured diff storage for edits |
| Edit ratio severity | WikiTrust + revscoring | Quantify edit severity for trust weighting |
| Three-version quality formula | WikiTrust `computerep.ml` | Measure if corrections stick across runs |
| LLM-based pattern reconciliation | ADR-003 (Original) | Extract correction patterns from diffs |

### What's Original to Agent OS (no existing solution)

1. **Process-scoped trust earning** — all systems are user-scoped or item-scoped, not process-scoped
2. **Edit severity → trust weight** — WikiTrust computes reputation from edits but doesn't map to tier transitions
3. **Correction pattern extraction pipeline** — diff → pattern → memory → improved output → trust signal
4. **Never-auto-upgrade constraint** — all systems auto-promote; Agent OS always proposes, human decides
5. **Executor-type differentiation in trust** — Insight-005: scripts vs AI steps could earn trust differently

---

---

## 7. Multi-Source Signal Aggregation (2nd Pass)

**Research question:** How do systems combine trust/quality signals from heterogeneous sources (deterministic tests, human review, AI reviewer opinion) into a single decision?

See also: [Insight-009](../insights/009-feedback-is-multi-source.md) — feedback is multi-source, not just human review.

### Five Composition Patterns

| Pattern | Composition | Best for | Source |
|---------|------------|----------|--------|
| **Strict AND** | All signals must pass | Go/no-go gates | SonarQube `QualityGateEvaluatorImpl.java`, GitHub branch protection |
| **Weighted Average** | `sum(signal × weight) / sum(weights)` | Continuous scores | OpenSSF Scorecard `checker/check_result.go` (`AggregateScoresWithWeight`) |
| **Tiered Thresholds** | AND-within-tier, waterfall across tiers | Maturity models | OpsLevel/Cortex service scorecards |
| **Independent Groups** | AND across groups, cross-membership | Multi-stakeholder approval | GitLab merge request approval rules |
| **Boolean Algebra** | OR-of-ANDs (DNF) | Flexible policy | OPA/Rego policy engine |

### GitHub Branch Protection — Strict AND

GitHub combines heterogeneous signals via priority-based worst-of:
- `failure` if ANY context reports error or failure
- `pending` if no failures but any context is pending
- `success` only if ALL contexts report success

Branch protection composes: required checks (AND) + required reviews (threshold count) + CODEOWNERS (AND per file path) + signed commits (AND). All settings are AND-ed. When multiple rulesets target the same branch, most-restrictive-wins.

### SonarQube Quality Gate — Typed Conditions

Each condition has: `metricKey` (string), `operator` (GREATER_THAN | LESS_THAN), `errorThreshold` (string). Conditions are evaluated individually, then AND-ed. One failure = gate fails. The heterogeneity is handled at the individual condition level (each has its own operator/threshold), not at the composition level.

### OpenSSF Scorecard — Weighted Average

18+ checks, each producing score 0-10. Three aggregation functions:
- `AggregateScores()` — simple arithmetic mean
- `AggregateScoresWithWeight(scores map[int]int)` — weighted by importance
- `CreateProportionalScoreWeighted()` — weighted success/total ratios

Checks cover heterogeneous signals: branch protection, CI tests, code review, fuzzing, dependency updates, CII best practices.

### Agent OS Mapping

For trust tiers, the most relevant combination is **Tiered Thresholds** (mapping to existing 4 tiers) with **Weighted Average** within each tier to handle reliability differences. Each feedback source would contribute to the overall score with source-appropriate weighting:

| Source | Signal | Weight rationale |
|--------|--------|-----------------|
| Human review (approve/edit/reject) | Highest reliability, subjective | High weight |
| System/script (pass/fail) | Deterministic, objective | High weight, but binary |
| Review pattern (maker-checker, adversarial) | Medium reliability, AI-dependent | Medium weight |
| Self-assessment (confidence) | Uncalibrated | Low weight, trend-only |

---

## 8. Human-Reviewer Disagreement & Override Patterns (2nd Pass)

**Research question:** How do systems handle disagreement between automated checks and human judgment? How is the override recorded and used?

### Override Audit Patterns

**Google Binary Authorization — Break-Glass:**
The most mature override pattern. Adding label `image-policy.k8s.io/break-glass: "true"` to a deployment bypasses policy but **automatically logs to Cloud Audit Logs regardless of whether the deployment would have passed.** The recording happens independently of whether the override was "needed."

**GitHub Rulesets — Bypass Actors:**
```json
{ "actor_type": "Team", "bypass_mode": "pull_request" }
```
Three modes: `always` (unrestricted), `pull_request` (must open PR — creates audit trail), `exempt` (no audit). The `pull_request` mode is the key pattern: override is possible but always recorded.

**GitHub Code Scanning — Dual-Approval for Alert Dismissal:**
Dismissing a security alert uses request/approve/deny workflow. The `dismissed_reason` categories (`false_positive`, `wont_fix`, `used_in_tests`) feed back into the tool's future behavior. **"The appropriate reason from the dropdown may affect whether a query continues to be included in future analysis."**

### Dual-Signal Trust (Human vs Reviewer Disagreement)

No production system implements explicit dual-signal trust. But the data structures exist:

| Override Direction | Signal About AI Reviewer | Signal About Human |
|---|---|---|
| Human approves what AI flagged | Possible over-sensitivity (false positive) | Higher risk tolerance or context AI missed |
| Human rejects what AI passed | Missed something (false negative) | Stricter standards or domain knowledge |
| Human agrees with AI flag | Calibration confirmed | Aligned |
| Human agrees with AI pass | Calibration confirmed | Aligned |

**Amazon A2I — Confidence Threshold + Random Sampling:**
Three trigger types for human review: confidence below threshold, missing expected data, random sampling at configurable percentage. The sampling trigger (5% of all outputs regardless of confidence) provides unbiased ground-truth for AI calibration measurement.

**Agent OS mapping:** The existing spot-checked tier's ~20% sampling already provides this calibration data. When a sampled run is reviewed and the human agrees with the auto-advance decision, that's a calibration confirmation. When they disagree, it's a calibration signal for both the producing agent and the review pattern.

### Gaming Prevention

**Rubber-stamping signals** (no system computes these natively, but the metrics are identifiable):
- Time-on-review relative to diff size
- Comment-to-approval ratio
- Approval rate >95% with no comments
- Post-approval issues correlated with specific reviewers

**Anti-collusion patterns:**
- GitLab: cannot approve own MR, cannot approve if you added commits, cannot change approval rules per-MR
- Gerrit `copyCondition`: significant code changes between patch sets automatically clear prior approvals
- Chromium OWNERS: minimum 3-month tenure, consensus of existing owners to add new ones

**Trust inflation prevention:**
- A2I random sampling catches cherry-picked easy outputs
- Azure ML feature attribution drift detects when predictions correlate with "easy" features
- Stack Overflow daily rep cap (+200/day) prevents burst gaming

**Agent OS mapping:** Key risks to address:
1. Agent producing trivially-correct outputs to inflate approval rate → minimum complexity/substantiveness check
2. Reviewer agent rubber-stamping → track reviewer agreement rate with human overrides
3. Human batch-approving without reviewing → time-on-review tracking (Insight: `canAutoAdvance=false` for critical tier already partially addresses this)

---

## 9. Trust Visibility UX (2nd Pass)

Full research report at: `docs/research/trust-visibility-ux.md`

### Key UX Patterns Found

| # | Pattern | Source | Agent OS application |
|---|---------|--------|---------------------|
| 1 | Projected rate at next evaluation | eBay seller dashboard | "At current correction rate, next evaluation will show..." |
| 2 | Privilege ladder | Stack Overflow | Show what each trust tier unlocks |
| 3 | Quality gate as scorecard | SonarQube | Upgrade eligibility as checklist of conditions |
| 4 | Error budget / burn rate | Grafana/Datadog SLOs | "Trust budget: 70% remaining before auto-downgrade" |
| 5 | **Evaluate mode (dry run)** | GitHub rulesets | **Strongest pattern found.** Simulate what would happen at a different tier using historical data |
| 6 | Requirements preview | Stripe capabilities | Show obligations that come with upgrade, not just benefits |
| 7 | No progress bar (deliberate) | Discourse | Consider whether showing progression encourages gaming |
| 8 | System-wide threshold config + bootstrap mode | Discourse admin | Org-level defaults with per-process overrides |

### Gaps in Current Agent OS Design (Trust Control, Primitive 11)

The existing architecture spec describes Trust Control as "shows current tier, how earned, what changes if adjusted." This research identifies 7 specific gaps:

1. **No projected rate / trajectory** — user can't see where trust is heading
2. **No trust budget / burn rate** — user can't see how close to downgrade
3. **No upgrade eligibility scorecard** — individual conditions not shown as pass/fail
4. **No evaluate mode / simulation** — can't simulate "what would have happened"
5. **No per-event trust delta** — can't see which specific runs affected trust
6. **No peer comparison** across similar processes
7. **No org-wide trust configuration** — currently per-process only

---

## 10. Phase 2 Feedback Signals Already Being Generated (2nd Pass)

See also: [Insight-009](../insights/009-feedback-is-multi-source.md), Section "Phase 2 Feedback Already Being Generated"

The harness pipeline records signals in `harnessDecisions` that are not currently consumed as trust input:

| Signal | Where it lives | Trust relevance |
|--------|---------------|-----------------|
| Review verdict (pass/flag/retry) | `harnessDecisions.reviewResult` | Direct: pass = positive, flag = negative |
| Retries before passing | `harnessDecisions.reviewDetails.retriesUsed` | 0 retries = stronger positive than 2 retries |
| Per-criterion spec-test results | `harnessDecisions.reviewDetails.layers[].criteriaResults` | Which quality criteria pass/fail |
| Script step pass/fail | `stepRuns.status` | Deterministic, high-reliability signal |
| Agent confidence | `stepResult.confidence` | Uncalibrated but trends meaningful |
| **Human-reviewer agreement** | **Not recorded** | **Critical gap:** human overriding a "flag" is a signal about both producer and reviewer |

---

## 11. Updated Summary: Patterns Available to Build From

### Original patterns (1st pass)

| Pattern | Source | Applicability |
|---------|--------|--------------|
| Event-sourced accumulation | Paperclip `costEvents` | Trust events as append-only records |
| Two-threshold warn/stop | Paperclip `budgetPolicies` | Downgrade warn + hard thresholds |
| Approval as decision record | Paperclip `approvals` | Upgrade suggestions as proposals |
| Config revision audit trail | Paperclip `agentConfigRevisions` | Trust tier change history |
| Fixed sliding window | Discourse TL3 (100 days) | "Last N runs" window |
| Exponential decay | Beta Reputation System | Weighted recency |
| Beta distribution scoring | Josang & Ismail 2002 | Continuous trust score from feedback |
| Wilson score interval | Reddit/Evan Miller | Upgrade eligibility with small-sample safety |
| Conjunctive upgrade / disjunctive downgrade | eBay (published seller standards) | Upgrade needs ALL criteria; downgrade on ANY |
| Grace period | Discourse (published TL3 docs) | Prevent oscillation at tier boundaries |
| Word-level diff with change objects | jsdiff (`kpdecker/jsdiff`) | Structured diff storage for edits |
| Edit ratio severity | WikiTrust + revscoring | Quantify edit severity for trust weighting |
| Three-version quality formula | WikiTrust `analysis/computerep.ml` | Measure if corrections stick across runs |
| LLM-based pattern reconciliation | ADR-003 (Original) | Extract correction patterns from diffs |

### New patterns (2nd pass)

| Pattern | Source | Applicability |
|---------|--------|--------------|
| Strict AND composition | SonarQube `QualityGateEvaluatorImpl.java` | Upgrade eligibility gate |
| Weighted average composition | OpenSSF Scorecard `checker/check_result.go` | Multi-source trust score |
| Tiered thresholds (AND-within-tier) | OpsLevel/Cortex service scorecards | Maps to 4-tier trust model |
| Break-glass with automatic audit | Google Binary Authorization | Override always recorded |
| Bypass modes (always/pull_request/exempt) | GitHub Rulesets API | Trust gate override levels |
| Dismissal reason → tool calibration | GitHub Code Scanning | Human override feeds back to reviewer quality |
| Confidence threshold + random sampling | Amazon A2I | Spot-checked tier calibration |
| `copyCondition` (clear votes on change) | Gerrit submit requirements | Trust signals decay when artifact changes |
| Anti-self-approval rules | GitLab merge request settings | Producer ≠ reviewer enforcement |
| Evaluate mode / dry-run simulation | GitHub Rulesets | Simulate tier change impact before applying |
| Trust budget / error budget | Grafana/Datadog SLOs | Downgrade proximity visualization |
| Upgrade eligibility scorecard | SonarQube + Backstage Soundcheck | Individual conditions shown pass/fail |
| Requirements + obligations preview | Stripe capabilities | Show what comes WITH an upgrade |

### What's Original to Agent OS (no existing solution)

1. **Process-scoped trust earning** — all systems are user-scoped or item-scoped
2. **Multi-source trust aggregation for a process** — combining human, agent, system, outcome signals into per-process trust (Insight-009)
3. **Edit severity → trust weight** — WikiTrust computes reputation but doesn't map to tier transitions
4. **Correction pattern extraction pipeline** — diff → pattern → memory → improved output → trust signal
5. **Never-auto-upgrade constraint** — all systems auto-promote; Agent OS always proposes, human decides
6. **Executor-type differentiation in trust** — Insight-005: scripts vs AI steps could earn trust differently
7. **Dual-signal trust from human-reviewer disagreement** — human override as signal about both producer and reviewer
8. **Trust simulation / evaluate mode for trust tiers** — GitHub has evaluate mode for rulesets, but applying simulation to progressive trust tiers is novel

---

## 12. Landscape Evaluation Flags

No existing landscape evaluations appear outdated. New pattern sources worth tracking:

- **SonarQube** — quality gate composition patterns (if building upgrade eligibility gates)
- **OpenSSF Scorecard** — weighted multi-signal aggregation (if building multi-source trust scoring)
- **Backstage Soundcheck / Cortex** — scorecard UI patterns (for Phase 9 web dashboard)
- **GitHub Rulesets evaluate mode** — simulation-before-change patterns
- **Amazon A2I** — confidence threshold + random sampling for human-in-the-loop (validates spot-checked tier design)
