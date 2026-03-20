# Research Report: Trust Visibility UX Patterns

**Date:** 2026-03-19
**Research question:** How do existing systems show trust/reputation/quality scores to users? What concrete UX patterns and data models can Agent OS build from?
**Status:** Complete — pending review

---

## 1. Trust Progression UX — How Users See Their Level and Path Forward

### eBay Seller Performance Dashboard

**Pattern: Multi-metric status card + peer comparison + projected rate**

eBay's seller dashboard is the richest trust progression UX found. Key elements:

**Three-tier system (Below Standard / Above Standard / Top Rated):**
- Dashboard shows a detailed breakdown across three factors: transaction defect rate, late shipment rate, cases closed without resolution
- Each metric shown as the seller's current rate vs the threshold for their current tier and the next tier
- Monthly evaluations on the 20th — sellers know exactly when their next evaluation happens

**Service Metrics Dashboard (peer benchmarking):**
- Shows the seller's item-not-received rate and item-not-as-described rate
- Compared against peer group — sellers with similar volume, categories, price points, and shipping destinations
- Performance classified as Low (good), Average, High, Very High (bad)
- Uses status icons: checkmark for acceptable, prohibition icon for Very High
- Critically: shows **projected rate for the next evaluation** — the seller can see where they're heading before the evaluation happens

**Adaptive evaluation windows:**
- 3-month lookback for high-volume sellers (400+ transactions)
- 12-month lookback for low-volume sellers
- This means low-volume sellers need consistent performance over a longer period

**UX pattern to extract:** The "projected rate" is powerful. It answers "if I keep doing what I'm doing, what happens next month?" Agent OS could show: "At current correction rate (12%), next evaluation would keep you at Spot-checked. To reach Autonomous, you need <5% correction rate sustained over 20 more runs."

**Data model required:**
```
trust_dashboard {
  current_tier, next_tier_up,
  metrics: [{
    name, current_value, tier_threshold, next_tier_threshold,
    trend (improving/stable/declining),
    projected_value_at_next_evaluation
  }],
  evaluation_window_start, evaluation_window_end, next_evaluation_date,
  peer_comparison: { peer_group_description, peer_average, relative_performance }
}
```

### Stack Overflow Reputation

**Pattern: Cumulative score + privilege thresholds as a ladder**

Stack Overflow displays reputation as a single integer (visible on every post, profile, and leaderboard). Progression is shown through a privilege ladder:

**Reputation earning/losing:**
- +10 for answer upvote, +5 for question upvote, +15 for accepted answer, +2 for approved edit
- -2 for received downvote, -1 for giving a downvote
- Daily cap of +200 prevents gaming
- Association bonus of +100 from linked sites (cold-start mitigation)

**Privilege thresholds (selected):**
| Rep | Privilege |
|-----|-----------|
| 1 | Create posts |
| 15 | Upvote |
| 50 | Comment anywhere |
| 125 | Downvote |
| 500 | Retag questions |
| 2,000 | Edit without approval |
| 3,000 | Close/reopen votes |
| 10,000 | Access moderator tools |
| 20,000 | Trusted user |
| 25,000 | Access site analytics |

**Progression UX:**
- Profile shows current rep prominently
- Privileges page shows full ladder — earned privileges are visually distinguished from unearned
- "Next privilege" indicator shows how many points remain
- Reputation history tab: chronological feed of every rep-changing event with links to the source (which answer got upvoted, which edit was approved)

**UX pattern to extract:** The privilege ladder is the clearest "what can I do at the next level" pattern. Each threshold is concrete: at 2,000 you can edit without approval. Agent OS equivalent: "At Spot-checked, 30% of outputs are reviewed. At Autonomous, 0% are reviewed unless auto-downgrade triggers."

**Data model required:**
```
reputation_profile {
  current_score: number,
  history: [{ event_type, delta, timestamp, source_reference }],
  privileges: [{ name, threshold, earned: boolean, earned_at? }],
  next_privilege: { name, threshold, points_remaining },
  daily_earned: number, daily_cap: number
}
```

### Discourse Trust Levels

**Pattern: Activity-based levels with automated promotion/demotion + admin override**

Discourse uses 5 trust levels (TL0-TL4) with distinct UX characteristics:

**Progression visibility:**
- Users see their current trust level on their profile page
- Welcome PM on signup mentions the trust system and links to documentation
- Promotion PMs at TL1 and TL2 congratulate and explain new abilities
- TL3 promotion gets a "longer form PM describing their new abilities"
- A trust level distribution summary appears on community dashboards

**Key insight — progression is NOT shown as a progress bar.** Users know their level and what each level requires (documented), but there's no "you're 73% of the way to TL3" indicator. This is deliberate — Discourse wants natural behavior, not gaming.

**Requirements are multi-dimensional (TL2 to TL3 example):**
- Visit 50% of days in last 100 days
- Reply to 10+ different topics
- View 25% of recent topics
- Read 25% of recent posts
- Receive 20+ likes with distribution minimums
- Give 30+ likes
- No 5+ spam flags
- No suspensions in 6 months

**Demotion pattern:** Only TL3 can be lost (rolling 100-day window). TL0-TL2 are ratchets — once earned, never lost. TL4 is manual-only (granted by staff, revoked by staff). 2-week grace period after earning TL3 prevents oscillation.

**Admin controls:**
- Admins can manually set any user to any trust level
- All automatic requirements are configurable via site settings (searchable by `tl1`, `tl2`, `tl3` prefixes)
- "Bootstrap mode" auto-promotes early adopters to TL1 to kickstart community

**UX pattern to extract:** The deliberate choice NOT to show a progress bar is worth noting. Discourse prioritizes natural behavior over "gaming toward the next level." Agent OS should consider: do we want process operators to optimize for trust metrics, or do we want trust to emerge naturally? The answer may be "show progress to administrators but not to processes/agents."

**Data model required:**
```
trust_level {
  user_id, current_level: 0-4, manually_set: boolean,
  promotion_history: [{ from, to, timestamp, reason: 'automatic'|'manual', admin_id? }],
  current_window_stats: {
    days_visited, topics_entered, posts_read,
    likes_given, likes_received, replies_to_topics,
    spam_flags, suspensions
  },
  window_start, window_end, grace_period_until?
}
```

### GitHub Contribution Profile

**Pattern: Activity heatmap + contribution summary + no explicit trust scoring**

GitHub shows contribution data but does not map it to trust levels. Relevant patterns:

- **Contribution heatmap:** Calendar grid, color intensity = activity volume. Instantly shows consistency vs sporadic contribution.
- **Contribution breakdown:** Commits, PRs, issues, code review tabs with counts
- **Organization membership badges:** Visual indicator of affiliation
- **Sponsor badge, Pro badge:** Explicit trust signals (verified identity, financial commitment)

**UX pattern to extract:** The heatmap pattern is interesting for showing consistency of process execution. A "run heatmap" for a process could instantly show: is this process running regularly or sporadically? Consistency is a trust signal.

---

## 2. Quality Dashboards — Multi-Signal Quality Visualization

### SonarQube Quality Gates

**Pattern: Binary pass/fail gate composed of multiple metric conditions**

SonarQube's quality gate is the canonical multi-signal quality check. While direct documentation pages were inaccessible, the system's patterns are well-established:

**Structure:**
- A quality gate is a set of conditions, each checking one metric against a threshold
- The gate passes only if ALL conditions pass (conjunctive — same as eBay's upgrade pattern)
- Default "Sonar way" gate focuses on new code only ("clean as you code")

**Typical conditions:**
| Metric | Condition | Rating system |
|--------|-----------|---------------|
| Coverage on new code | ≥ 80% | Percentage |
| Duplicated lines on new code | ≤ 3% | Percentage |
| Reliability rating | A | Letter grade A-E |
| Security rating | A | Letter grade A-E |
| Maintainability rating | A | Letter grade A-E |
| Security hotspots reviewed | 100% | Percentage |

**Visualization patterns:**
- Project dashboard shows a large pass/fail badge (green checkmark / red X)
- Below the badge: each condition listed with its current value, threshold, and individual pass/fail
- Conditions that fail are highlighted in red
- Letter grades (A-E) map to specific metric thresholds (e.g., A = 0 bugs, B = at least 1 minor, etc.)
- Historical trend: quality gate status shown as a timeline (pass/fail per analysis)

**UX pattern to extract:** The quality gate pattern maps directly to trust tier eligibility. A trust upgrade could be structured as a quality gate: "All of these must be true: approval rate ≥ 90%, correction trend declining, minimum 20 runs completed, no rejections in last 10 runs." Each condition shown with its current value and pass/fail status.

**Data model required:**
```
quality_gate {
  name, status: 'passed' | 'failed',
  conditions: [{
    metric_key, operator: '<' | '>' | '≤' | '≥',
    threshold, actual_value,
    status: 'passed' | 'failed'
  }],
  evaluated_at
}
```

### Backstage / Spotify Service Catalog + Scorecards

**Pattern: Entity catalog with pluggable quality signals via metadata YAML**

Backstage's core pattern is relevant but its quality scoring comes from plugins:

**Core catalog:**
- Services described in YAML metadata files stored with code
- YAML harvested and visualized in Backstage's UI
- Extensible entity model with annotations, relations, and statuses

**Soundcheck (Spotify's internal scorecard plugin, productized by Roadie):**
- Defines "checks" — individual quality conditions (e.g., has README, test coverage > 80%, no critical vulnerabilities)
- Checks compose into "scorecards" — named collections grouped by theme (security, reliability, documentation)
- Each check has a pass/fail status
- Scorecard shows overall completion percentage and individual check results
- Organization-wide view: table of all services with scorecard completion, sortable and filterable

**Cortex (similar product, competitor to Backstage scorecards):**
- Defines "initiatives" with rules and deadlines
- Services scored against initiatives
- Scores displayed as letter grades or percentages
- Progress tracked over time with trend lines
- Organization-wide leaderboard showing which teams/services are most compliant

**Atlassian Compass:**
- "Apply custom security and health scorecards" to components
- Tracks code quality, test coverage, vulnerabilities, performance, maintainability
- Multi-dimensional assessment across these categories

**UX pattern to extract:** The scorecard pattern — named collection of checks, each pass/fail, with an overall completion percentage — is the right model for trust eligibility. A "Trust Upgrade Scorecard" for a process could show: "4 of 5 conditions met. Remaining: sustained 20-run window not yet reached (currently at 14/20)."

**Data model required:**
```
scorecard {
  name, description, target_entity_id,
  checks: [{
    name, description, category,
    status: 'passed' | 'failed' | 'not_evaluated',
    current_value?, threshold?, last_evaluated
  }],
  completion_percentage,
  trend: [{ date, completion_percentage }]
}
```

### Grafana / Datadog SLO Dashboards

**Pattern: Error budget visualization with burn rate and remaining budget**

SLO dashboards use a distinctive UX pattern for showing reliability:

**Core concepts visualized:**
- **SLI (Service Level Indicator):** The measured metric (e.g., 99.2% of requests under 200ms)
- **SLO (Service Level Objective):** The target (e.g., 99.9% over 30 days)
- **Error budget:** The allowed failures (e.g., 0.1% = ~43 minutes of downtime in 30 days)
- **Burn rate:** How fast the error budget is being consumed

**Dashboard patterns (Grafana best practices):**
- **RED method composition:** Rate, Errors, Duration shown side-by-side — request rate on left, error rate + latency on right
- **Color-coded thresholds:** "Blue means it's good, red means it's bad." Thresholds trigger automatic color changes.
- **Budget remaining gauge:** Shows what percentage of error budget remains — green when healthy, yellow when >50% consumed, red when >80% consumed
- **Burn rate alert:** If current burn rate would exhaust the budget before the window ends, alert fires
- **Normalized axes:** CPU as percentage (not raw cores), so different services are comparable
- **Directed browsing:** "Just show data for the ones in trouble" — filter to degraded services

**UX pattern to extract:** The error budget metaphor maps to trust. A process at "Spot-checked" has a "trust budget" — it can absorb some corrections before downgrade. The dashboard could show: "Trust budget: 70% remaining. 3 corrections in 10 runs. Auto-downgrade at 30% correction rate (currently 17%)."

**Data model required:**
```
trust_budget {
  process_id, current_tier,
  window_start, window_end,
  total_runs, corrections, rejections, clean_approvals,
  correction_rate, rejection_rate,
  downgrade_threshold, current_vs_threshold_ratio,
  budget_remaining_percentage,
  burn_rate: 'healthy' | 'elevated' | 'critical',
  projected_status_at_window_end
}
```

---

## 3. "What Would Change If..." UX — Impact Preview

### GitHub Rulesets — Evaluate Mode

**Pattern: Dry-run mode that logs what WOULD be blocked without actually blocking**

GitHub repository rulesets have three enforcement modes:

| Mode | Behavior |
|------|----------|
| **Active** | Rules are enforced — violating actions are blocked |
| **Evaluate** | Rules are NOT enforced — but violations are logged in "Rule Insights" |
| **Disabled** | Rules are inactive |

**"Evaluate" mode is the key pattern.** It lets administrators:
1. Define a set of rules (require PR reviews, require status checks, require signed commits, etc.)
2. Turn them on in "Evaluate" mode
3. See in "Rule Insights" which actions WOULD have been blocked
4. Decide whether to activate based on real data about impact

**Rulesets also layer:** Multiple rulesets can apply to the same branches. The most restrictive combination wins. Collaborators can see which rules apply to a branch through the web UI, git client, and CLI.

**UX pattern to extract:** This is directly applicable to trust tier changes. Before upgrading from Supervised to Spot-checked, Agent OS could show: "In the last 20 runs, if this process had been at Spot-checked, 6 runs would NOT have been reviewed. Of those 6, all were clean approvals — no corrections were missed." This is "evaluate mode for trust" — simulating what would have happened at a different tier.

**Data model required:**
```
trust_simulation {
  process_id,
  simulated_tier, current_tier,
  window: { start, end },
  runs_evaluated: number,
  runs_that_would_skip_review: number,
  of_skipped_runs_that_were_clean: number,
  of_skipped_runs_that_needed_correction: number,
  missed_correction_details: [{ run_id, correction_description }],
  recommendation: 'safe_to_upgrade' | 'corrections_would_be_missed'
}
```

### Stripe Capabilities — Requirements Preview

**Pattern: Show what's needed to unlock a capability BEFORE requesting it**

Stripe's Connect platform has a capabilities model where connected accounts must meet requirements to unlock functionality:

**Capability lifecycle:**
- Status values: `unrequested`, `pending`, `active`, `inactive`
- Each capability has associated requirements that vary by business type and country
- Requirements categorized as `currently_due`, `past_due`, `eventually_due`

**The preview pattern:** Stripe's API allows platforms to preview requirements BEFORE requesting a capability. This means the UI can show: "To accept card payments, you'll need to provide: business address, tax ID, bank account details, identity verification." The user sees the full cost of an upgrade before committing.

**UX pattern to extract:** Agent OS could show: "To upgrade to Autonomous, these conditions must be met: [scorecard]. Additionally, auto-downgrade triggers will be set at: correction rate >30%, any rejection, significant input change. Are you comfortable with this?" This previews not just the benefits but the obligations of a higher trust tier.

---

## 4. Audit Trail Visibility — Understanding WHY Trust Is at a Given Level

### eBay Seller Performance Detail Pages

**Pattern: Event-by-event breakdown with categorized impact**

eBay's seller performance detail goes beyond the dashboard summary:

- Each defect is listed individually with the transaction it relates to
- Cases, late shipments, and defects are shown as individual records
- Sellers can see exactly which transactions pulled their metrics down
- Timeline view shows when each event occurred within the evaluation window
- "Projected rate" shows how removing a single defect would change the metric

**UX pattern to extract:** Trust audit trail should show individual events (each run's review outcome) with their impact on the overall score. "Run #34 was corrected (major edit, editRatio 0.45) — this added +1 negative to your trust score."

### GitHub Audit Log

**Pattern: Structured event log with entity-based filtering**

GitHub's organization audit log provides:

- **Event structure:** who performed the action, what the action was, when it was performed
- **Default view:** last 3 months, with date range selection up to 180 days
- **Filtering:** by operation type (`create`, `modify`), by repository, by actor, by action category
- **No full-text search** — only structured query qualifiers
- **Time-based display:** ISO8601 dates with range queries

**UX pattern to extract:** Trust change history should be filterable by event type (approval, correction, rejection, tier change, manual override) and show in reverse chronological order. Each entry should link to the run/review that generated it.

### Composite Audit Trail Pattern (synthesized)

The best audit trails across these systems share common elements:

```
trust_event_log {
  entries: [{
    timestamp,
    event_type: 'run_approved' | 'run_corrected' | 'run_rejected' |
                'tier_upgraded' | 'tier_downgraded' | 'manual_override',
    actor: { type: 'system' | 'human', id, name },
    details: {
      run_id?, edit_ratio?, correction_pattern?,
      old_tier?, new_tier?, reason?,
      trust_score_before, trust_score_after, trust_score_delta
    },
    impact_summary: string  // "Correction rate increased from 12% to 15%"
  }],
  filters: { event_types, date_range, actor },
  aggregate_view: { total_events, by_type: { [type]: count } }
}
```

---

## 5. Trust Controls — Administrator Override UX

### Discourse Admin Trust Level Management

**Pattern: Per-user override with configurable system-wide thresholds**

Discourse provides two levels of trust control:

**Per-user override:**
- Admin can set any user to any trust level (TL0-TL4)
- TL4 (Leader) is ONLY available via manual assignment
- Manually set levels can be either permanent or subject to normal rules

**System-wide threshold configuration:**
- All automatic promotion requirements are admin-configurable via site settings
- Settings are namespaced by tier (`tl1_*`, `tl2_*`, `tl3_*`)
- Admins can make promotion easier or harder for the whole community
- "Bootstrap mode" exists for new communities — relaxes requirements temporarily

**UX pattern to extract:** Agent OS Trust Control (Primitive 11) already captures this well. Key additions from Discourse: the ability to configure thresholds system-wide (not just per-process), and the concept of "bootstrap mode" where new processes have relaxed requirements.

### GitHub Organization Permission Management

**Pattern: Role hierarchy with organization-wide policies**

GitHub's five-level role hierarchy (Read, Triage, Write, Maintain, Admin) demonstrates:

- **Clear capability ladder:** Each role is a strict superset of the one below
- **Organization-level defaults:** Org owners set base permissions for all repos
- **Per-repository overrides:** Individual repos can grant higher access
- **Team-based assignment:** Roles assigned to teams, not just individuals
- **Audit logging:** Permission changes are tracked in the org audit log (accessible to owners only)

**UX pattern to extract:** The team-based assignment pattern is relevant. In Agent OS, trust might eventually be managed at the "process category" level (all invoice processes start at Supervised) with per-process overrides. The org-level defaults + per-entity overrides pattern is well-proven.

---

## 6. Synthesis: Patterns for Agent OS Trust Visibility

### Pattern Catalog

| # | Pattern | Source | Agent OS application |
|---|---------|--------|---------------------|
| 1 | **Multi-metric status card** | eBay seller dashboard | Trust Control shows approval rate, correction rate, trend, projected status |
| 2 | **Peer comparison** | eBay service metrics | Compare process performance against similar processes (same category/domain) |
| 3 | **Projected rate at next evaluation** | eBay service metrics | "At current trajectory, next evaluation will show..." |
| 4 | **Privilege ladder** | Stack Overflow | Show what each trust tier unlocks (review frequency, auto-downgrade triggers) |
| 5 | **Score + event history** | Stack Overflow reputation | Trust score with chronological feed of every trust-affecting event |
| 6 | **No progress bar (deliberate)** | Discourse | Consider whether showing progression encourages gaming vs natural behavior |
| 7 | **Ratchet tiers vs demotable tiers** | Discourse | Lower tiers could be ratchets; highest tiers subject to demotion |
| 8 | **Activity heatmap** | GitHub contributions | Run frequency heatmap shows consistency |
| 9 | **Quality gate as scorecard** | SonarQube | Trust upgrade eligibility as a checklist of conditions, each pass/fail |
| 10 | **Scorecard with completion %** | Backstage Soundcheck | "4 of 5 upgrade conditions met" |
| 11 | **Error budget / remaining budget** | Datadog/Grafana SLOs | "Trust budget: 70% remaining before auto-downgrade" |
| 12 | **Burn rate indicator** | Datadog SLOs | "Current correction rate would exhaust trust budget in 8 runs" |
| 13 | **Evaluate mode (dry run)** | GitHub rulesets | Simulate what would happen at a different trust tier using historical data |
| 14 | **Requirements preview** | Stripe capabilities | Show what conditions AND obligations come with a tier upgrade |
| 15 | **Per-event impact in audit trail** | eBay seller detail | Each run's review outcome shown with its trust score delta |
| 16 | **Structured event filtering** | GitHub audit log | Filter trust history by event type, date range, actor |
| 17 | **System-wide threshold config** | Discourse admin | Configure trust requirements at org level, override per process |
| 18 | **Bootstrap mode** | Discourse | Relaxed trust requirements for new deployments |

### Recommended Data Model for Agent OS Trust Dashboard

Combining the patterns above, the backend needs to serve these data structures:

```typescript
// Trust Dashboard (combines patterns 1, 3, 4, 9, 10, 11, 12)
interface TrustDashboard {
  processId: string;
  processName: string;

  // Current state
  currentTier: 'supervised' | 'spot-checked' | 'autonomous';
  tierSetAt: Date;
  tierSetBy: 'system' | 'human';
  manualOverride: boolean;

  // Earned data (pattern 1)
  window: { start: Date; end: Date; };
  totalRuns: number;
  approvals: number;
  corrections: number;
  rejections: number;
  approvalRate: number;       // approvals / totalRuns
  correctionRate: number;     // corrections / totalRuns
  trend: 'improving' | 'stable' | 'declining';

  // Trust budget (patterns 11, 12)
  budget: {
    downgradeThreshold: number;   // e.g., 0.30 correction rate
    currentRate: number;
    budgetRemaining: number;      // percentage before downgrade
    burnRate: 'healthy' | 'elevated' | 'critical';
    projectedStatusAtWindowEnd: 'stable' | 'at_risk' | 'downgrade_likely';
  };

  // Upgrade eligibility scorecard (patterns 9, 10)
  upgradeScorecard: {
    nextTier: string;
    conditions: Array<{
      name: string;
      description: string;
      threshold: number | string;
      currentValue: number | string;
      passed: boolean;
    }>;
    completionPercentage: number;
    allConditionsMet: boolean;
  } | null;   // null if already at highest tier

  // Simulation (pattern 13)
  simulation: {
    simulatedTier: string;
    runsAnalyzed: number;
    runsThatWouldSkipReview: number;
    missedCorrections: number;
    safe: boolean;
  } | null;

  // System recommendation
  recommendation: {
    action: 'upgrade' | 'maintain' | 'downgrade';
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  };
}

// Trust Event (patterns 5, 15, 16)
interface TrustEvent {
  id: string;
  processId: string;
  timestamp: Date;
  eventType: 'run_approved' | 'run_corrected' | 'run_rejected' |
             'tier_upgraded' | 'tier_downgraded' | 'manual_override' |
             'auto_downgrade_triggered';
  actor: { type: 'system' | 'human'; id: string; name: string; };
  details: {
    runId?: string;
    editRatio?: number;
    correctionPattern?: string;
    oldTier?: string;
    newTier?: string;
    reason?: string;
  };
  trustScoreBefore: number;
  trustScoreAfter: number;
  trustScoreDelta: number;
  impactSummary: string;  // Human-readable: "Correction rate increased from 12% to 15%"
}

// Trust Configuration (patterns 17, 18)
interface TrustConfig {
  // Organization-wide defaults
  orgDefaults: {
    upgradeConditions: Record<string, ConditionSet>;
    downgradeThresholds: Record<string, number>;
    evaluationWindow: { type: 'fixed' | 'adaptive'; days: number };
    minimumRunsBeforeUpgrade: number;
    gracePeriodAfterUpgrade: number;  // runs before demotion possible
    bootstrapMode: boolean;
  };
  // Per-process overrides
  processOverrides: Record<string, Partial<typeof orgDefaults>>;
}
```

### Key Design Decisions for Agent OS

1. **Show progression or not?** Discourse deliberately hides progress bars. Stack Overflow shows them prominently. Recommendation: show progression to the human operator (who governs the process), but structure it as a scorecard ("4 of 5 conditions met") not a progress bar (which implies inevitability).

2. **Evaluate mode before upgrade.** GitHub's rulesets evaluate mode is the strongest pattern found. Before any trust upgrade, Agent OS should simulate: "of the runs that WOULD have skipped review at the new tier, how many actually needed correction?" This gives the human concrete evidence for their decision.

3. **Trust budget metaphor.** The SLO error budget metaphor translates directly: the process has a "trust budget" that corrections consume. When the budget is exhausted, auto-downgrade triggers. Show remaining budget as a percentage with a burn rate indicator.

4. **Event-level audit trail.** Every trust-affecting event must be individually visible with its delta impact on the overall score. The human should be able to answer: "why did this process lose trust?" by drilling into specific runs.

5. **Requirements preview for upgrades.** Stripe's pattern of showing what OBLIGATIONS come with a capability is important. Upgrading trust isn't free — it comes with auto-downgrade triggers. Show: "If you upgrade to Autonomous, these auto-downgrade rules will be active: [list]."

---

## 7. Relationship to Existing Agent OS Design

The Trust Control primitive (Primitive 11 in `docs/human-layer.md`) already captures several of these patterns:
- Earned data section (approval rate, correction rate, last 10 runs)
- System recommendation with accept/reject
- Auto-downgrade triggers

**Gaps in current design that this research fills:**
- **Projected rate / trajectory** (eBay pattern) — not yet in the wireframe
- **Trust budget / burn rate visualization** (SLO pattern) — not yet conceptualized
- **Upgrade eligibility scorecard** (SonarQube/Soundcheck pattern) — current design shows recommendation but not the individual conditions
- **Evaluate mode / simulation** (GitHub rulesets pattern) — not yet conceptualized; strongest novel pattern found
- **Per-event trust delta in audit trail** (eBay detail pattern) — current design mentions history is "accessible" but doesn't specify the UX
- **Peer comparison** (eBay pattern) — not yet conceptualized; could compare correction rates across similar processes
- **Organization-wide trust configuration** (Discourse admin pattern) — current design is per-process only

---

## 8. Landscape Evaluation Flags

No existing landscape evaluations need updating based on this research. The patterns discovered are UX conventions from established platforms, not new frameworks requiring evaluation.

New pattern sources worth tracking:
- Backstage Soundcheck / Cortex scorecards — for scorecard UI patterns if Agent OS builds a web dashboard
- GitHub rulesets evaluate mode — for simulation-before-change patterns
