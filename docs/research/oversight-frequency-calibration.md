# Oversight Frequency Calibration: How Real Systems Decide What to Review

Research date: 2026-03-20

## Summary

This research catalogues concrete mechanisms that real-world systems use to calibrate how often a human reviews, approves, or intervenes. The goal is to inform Agent OS's trust/oversight model with proven patterns, not theory.

---

## 1. Statistical Sampling (ISO 2859 / AQL)

### The mechanism

ISO 2859-1 is the international standard for acceptance sampling by attributes. It defines a complete system for deciding how many items from a batch to inspect, and when to tighten or relax inspection.

**Core inputs:** lot size, inspection level (I/II/III), and Acceptable Quality Limit (AQL).

**How it works:**
1. Lot size + inspection level yields a **code letter** from a lookup table.
2. Code letter + AQL yields a **sample size** and **accept/reject numbers**.
3. If defects found <= accept number, lot passes. If >= reject number, lot fails.

**Example:** A lot of 1,000 units at General Inspection Level II with AQL 2.5% requires a sample of 80 units. Accept if <= 5 defects; reject if >= 6.

### Switching rules (the trust mechanism)

ISO 2859's most relevant feature for Agent OS is its **three-state switching system**:

| State | Entry criteria | Effect |
|-------|---------------|--------|
| **Normal** | Starting state | Standard sample size and accept/reject numbers |
| **Tightened** | 2 out of 5 consecutive lots rejected | Larger sample, stricter accept/reject criteria |
| **Reduced** | 10 consecutive lots accepted + switching score met | Smaller sample, more lenient criteria |
| **Discontinued** | 5 consecutive lots rejected under tightened | Stop accepting; supplier must fix and restart |

**Key insight:** The system doesn't just track pass/fail -- it tracks *streaks*. Trust is earned through consecutive successes and lost through clustered failures. This is a state machine with hysteresis (harder to earn reduced inspection than to lose it).

### Mapping to Agent OS

- AQL maps to **acceptable error rate per process importance tier**
- Switching rules map to **trust state transitions** -- 10 consecutive clean runs to earn autonomy, 2-of-5 failures to tighten oversight
- Discontinuation maps to **process lockout** -- agent loses ability to act autonomously until root cause is addressed
- Different AQL levels for critical/major/minor defects maps to **severity-weighted review** -- critical process outputs always reviewed, minor ones sampled

Sources: [ISO 2859 Guide](https://www.testcoo.com/en/blog/understanding-iso-2859-a-comprehensive-guide-to-sampling-for-quality-inspection), [AQL Inspection Levels](https://qualityinspection.org/inspection-level/), [Switching Rules](https://www.sqconline.com/switching-rules-iso-2859-1)

---

## 2. Skip-Lot Sampling (Earned Reduced Inspection)

### The mechanism

Skip-lot sampling (SkSP-2 per NIST) goes beyond reduced sampling to **skipping entire lots**. Once a supplier has earned trust through consecutive accepted lots, only a fraction `f` of submitted lots are inspected at all.

**Procedure:**
1. Start with normal lot-by-lot inspection using a reference sampling plan.
2. After `i` consecutive lots accepted, switch to inspecting only fraction `f` of lots (selected randomly).
3. If any inspected lot is rejected, immediately revert to lot-by-lot inspection.
4. Re-qualify by passing `i` consecutive lots again.

**Key numbers:** Typical qualifying streak `i` = 10-15 consecutive lots. Typical fraction `f` = 1/2 to 1/5 (inspect every 2nd to every 5th lot).

### Mapping to Agent OS

This is the most direct analogue for "the agent has proven itself, so we only spot-check." The fraction `f` is the review sampling rate. A process with 20 consecutive clean runs might only get reviewed 1-in-5 times. One failure resets to 100% review.

Sources: [NIST Skip-Lot Sampling](https://www.itl.nist.gov/div898/handbook/pmc/section2/pmc27.htm), [SkSP-2 System](https://www.hindawi.com/journals/tswj/2014/192412/)

---

## 3. Statistical Process Control (SPC) Run Rules

### The mechanism

SPC doesn't sample batches -- it monitors a continuous stream of measurements against control limits. The Western Electric rules detect when a process has shifted out of control:

| Rule | Pattern | What it detects |
|------|---------|----------------|
| **Rule 1** | 1 point beyond 3-sigma | Sudden large shift |
| **Rule 2** | 2 of 3 consecutive points beyond 2-sigma (same side) | Moderate sustained shift |
| **Rule 3** | 4 of 5 consecutive points beyond 1-sigma (same side) | Small sustained shift |
| **Rule 4** | 9 consecutive points on same side of center | Process mean has drifted |

**CUSUM and EWMA charts** extend this for detecting small shifts (0.5-1.5 sigma). A standard Shewhart chart takes an average of 44 subgroups to detect a 1-sigma shift; CUSUM/EWMA detect it in ~10 subgroups.

### Calibration mechanism

The system is purely statistical. It doesn't decide review frequency upfront -- instead it runs autonomously and **signals when human attention is needed**. The signal sensitivity is tuned by:
- Control limit width (tighter = more sensitive = more false alarms)
- Which run rules are active (more rules = earlier detection but more false positives)
- EWMA weighting parameter lambda (0.2 is typical balance)

### Mapping to Agent OS

Rather than reviewing every Nth process run, monitor a quality metric continuously and alert when the pattern suggests the process has degraded. This is "review on anomaly" rather than "review on schedule." The Western Electric rules provide a concrete, implementable set of trigger conditions.

Sources: [Western Electric Rules](https://en.wikipedia.org/wiki/Western_Electric_rules), [CUSUM Charts](https://www.6sigma.us/six-sigma-in-focus/cusum-charts-detecting-process-shifts/), [EWMA Charts](https://www.6sigma.us/six-sigma-in-focus/exponentially-weighted-moving-average-ewma-chart/)

---

## 4. Content Moderation (Confidence-Based Routing)

### The mechanism

Platforms like TikTok, YouTube, and Meta use a **three-band confidence model**:

| Confidence band | Action | Approximate threshold |
|----------------|--------|----------------------|
| High confidence violation | Auto-remove | Score > 0.7 |
| Uncertain | Route to human review queue | Score 0.3 - 0.7 |
| High confidence clean | Auto-approve | Score < 0.3 |

**Scale:** TikTok reports 85%+ of takedowns are now automated. Over 96% of violating content removed by automation was caught before any views. Every uploaded video gets automated review; only the uncertain band reaches humans.

**Severity weighting:** Systems incorporate both severity of harm (type of violation) and expected reach (account's following) when deciding whether to auto-act or escalate. High-severity + high-reach content gets prioritized in human queues.

### Mapping to Agent OS

The three-band model maps directly: high-confidence routine outputs auto-approve, uncertain outputs get human review, clearly bad outputs get blocked. The severity x reach weighting maps to process importance x blast radius.

Sources: [TikTok Content Moderation](https://www.tiktok.com/transparency/en-us/content-moderation/), [TikTok Real-Time Moderation](https://www.scoredetect.com/blog/posts/how-tiktok-moderates-content-in-real-time), [Appeals Centre Guide](https://www.appealscentre.eu/guide-how-do-facebook-tiktok-and-youtube-make-content-decisions/)

---

## 5. Financial Compliance (AML Transaction Monitoring)

### The mechanism

Anti-money laundering systems monitor every transaction against rules and ML models, generating risk-scored alerts.

**Key numbers:**
- 95% of alerts from traditional rule-based AML systems are false positives
- Modern AI-augmented systems resolve 65-85% of routine false positives autonomously
- The remaining 15-35% go to human analysts

**Tiered response by risk score:**
- **High-risk alerts:** Hold transaction, 15-minute analyst review window
- **Medium-risk alerts:** Approve transaction but flag for post-transaction investigation
- **Low-risk alerts:** Batch for periodic review (not real-time)

**Visa/Mastercard fraud scoring:** Each transaction is scored 0-99 using 500+ data points. Risk-Based Authentication scores can reduce the need for strong customer authentication to 25% of transactions without compromising security.

### Adaptive thresholds

Thresholds adjust continuously based on observed activity. Merchant-level monitoring uses fraud-to-sales ratios with three escalation tiers: early warning, standard, and excessive.

### Mapping to Agent OS

The tiered response model (block/review-now/review-later/approve) with risk scores is directly applicable. The 15-minute vs. batch review distinction maps to synchronous vs. asynchronous human review modes. The merchant-level monitoring (tracking quality at the process level, not just the individual output level) maps to per-process trust tracking.

Sources: [AML Transaction Monitoring](https://www.sanctions.io/blog/anti-money-laundering-aml-transaction-monitoring-rules-and-best-practices), [Visa Fraud Monitoring](https://www.checkout.com/blog/what-is-the-visa-fraud-monitoring-program), [Visa RBA Scores](https://openwaygroup.com/new-blog/enhanced-fraud-detection-in-e-commerce-with-visa-and-mastercard-rba-score)

---

## 6. Insurance Underwriting (Straight-Through Processing)

### The mechanism

Insurance uses Straight-Through Processing (STP) to auto-approve low-risk applications:

**What gets auto-approved:**
- Risk score below threshold (e.g., 1-50 on a 100-point scale)
- Simple product types (term life, critical illness)
- Clean data with no cross-document discrepancies
- Low face value / small claims

**What gets human review:**
- Complex medical or financial risk profiles
- High-value policies
- Rule violations or data discrepancies
- Any case where the model's confidence is low

**Scale:** Leading markets achieve 75-90% STP rates for standard applications. The remaining 10-25% route to human underwriters.

### Mapping to Agent OS

This is the clearest "importance-based" routing model. Low-stakes, well-understood processes get high STP rates. Novel, high-stakes, or ambiguous cases always get human review. The validation checks (age in range, cross-document consistency, logical consistency, database lookups) map to automated pre-checks before a process output is released.

Sources: [Swiss Re on Underwriting](https://www.swissre.com/risk-knowledge/advancing-societal-benefits-digitalisation/reimagining-life-insurance-underwriting.html), [RGA Strategic Considerations](https://www.rgare.com/knowledge-center/article/strategic-considerations-for-automated-underwriting), [Automated Underwriting Guide](https://www.scnsoft.com/insurance/underwriting-automation)

---

## 7. Pharmaceutical QA (Risk-Based Sampling)

### The mechanism

FDA 21 CFR 211.165 requires "appropriate laboratory testing" of each batch. But "appropriate" is calibrated by risk:

**Core principle:** Sampling plans must result in statistical confidence, and the batch must meet predetermined criteria. Sample sizes are justified per ICH Q9 (risk assessment) and ICH Q10 (quality system).

**Specific FDA guidance:**
- Sample at least 7 in-process dosage units per sampling location
- Assay at least 3 of the 7
- Number of samples specified and justified for a given product and process

**Adaptive frequency:** Variability estimates from process qualification provide the basis for establishing levels and frequency of routine sampling and monitoring. Monitoring can then be adjusted to a statistically appropriate and representative level -- meaning a well-validated process earns lower sampling rates.

### Mapping to Agent OS

Pharma demonstrates that even in the most regulated environments, sampling rates are not fixed -- they're calibrated to demonstrated process capability. A process that has been validated and is performing within capability limits earns reduced monitoring. This is the regulatory-grade version of skip-lot sampling.

Sources: [FDA Process Validation Guidance](https://www.fda.gov/files/drugs/published/Process-Validation--General-Principles-and-Practices.pdf), [FDA CGMP Q&A](https://www.fda.gov/drugs/guidances-drugs/questions-and-answers-current-good-manufacturing-practice-regulations-production-and-process)

---

## 8. Autonomy Level Frameworks

### Sheridan & Verplank's 10 Levels (1978)

The foundational taxonomy, ranging from full human control to full machine autonomy:

| Level | Description |
|-------|------------|
| 1 | Human does everything |
| 2 | Computer offers alternatives |
| 3 | Computer narrows to a few options |
| 4 | Computer suggests one option |
| 5 | Computer executes if human approves |
| 6 | Computer executes, human can veto within limited time |
| 7 | Computer executes, then informs human |
| 8 | Computer executes, informs human only if asked |
| 9 | Computer executes, informs human only if it decides to |
| 10 | Computer does everything, ignores human |

**Key insight:** The levels are not just about who decides, but about the **information flow**. Levels 5-9 are all about the timing and conditionality of human notification. This maps directly to oversight frequency -- level 5 is "review every action," level 7 is "review the log afterward," level 9 is "review only exceptions."

### SAE J3016 (Autonomous Driving)

Six levels (0-5) with a critical distinction between "the human monitors" (L0-L2) and "the system monitors" (L3-L5). The key transition is at L3 where the system handles the fallback but must hand back to human when it reaches its limits.

**Relevance to Agent OS:** The L3 transition -- where the system is responsible for knowing when it's out of its depth and escalating -- is exactly the pattern needed. The agent must self-assess confidence and escalate, not rely on the human to catch problems.

### NASA Autonomy Levels

E1 (ground-controlled), E2 (pre-planned onboard execution), E3 (adaptive onboard execution). NASA's Distributed Spacecraft Autonomy (DSA) project works on multi-spacecraft task allocation with human-swarm commanding.

### Military Multi-UAV Control

Research shows optimal operator-to-vehicle ratios of 1:2 to 1:4. Operators can supervise up to 10 UAVs but performance degrades significantly. Higher automation enables higher ratios but introduces complacency and loss of situation awareness.

**Relevance to Agent OS:** A human overseeing multiple processes is the same problem as an operator supervising multiple drones. The ratio of processes-to-human depends on the autonomy level of each process. High-autonomy processes consume less attention budget.

Sources: [Sheridan & Verplank LOA](https://www.researchgate.net/figure/Levels-of-Automation-From-Sheridan-Verplank-1978_tbl1_235181550), [Human Control of AI](https://pmc.ncbi.nlm.nih.gov/articles/PMC12058881/), [Multi-UAV Control](https://pmc.ncbi.nlm.nih.gov/articles/PMC4878290/), [NASA DSA](https://www.nasa.gov/game-changing-development-projects/distributed-spacecraft-autonomy-dsa/)

---

## 9. AI Agent Adaptive Oversight (Anthropic Research)

### The mechanism

Anthropic's research on Claude Code usage (published Feb 2026) analyzed millions of interactions to measure how autonomy evolves in practice:

**Trust builds gradually:**
- New users (<50 sessions): full auto-approve ~20% of the time
- Experienced users (750+ sessions): full auto-approve ~40% of the time
- The increase is smooth and gradual, not step-function

**Oversight strategy shifts:**
- New users: approve each action before execution, rarely interrupt
- Experienced users: let agent work autonomously, interrupt when something goes wrong
- Experienced users interrupt *more often*, not less -- they shift from "pre-approval" to "exception-based" oversight

**Task complexity drives self-limitation:**
- On complex tasks, agents ask for clarification 2x more often than on simple tasks
- As tasks get harder, agents increasingly limit their own autonomy

**Confidence-based routing in practice:**
- Research suggests routing only the most critical ~14.5% of decisions to humans while maintaining safety standards
- 99.9th percentile turn duration nearly doubled (25min to 45min) between Oct 2025 and Jan 2026, reflecting growing trust

### Mapping to Agent OS

This is the only empirical data on how agent oversight frequency actually evolves in real systems. Key patterns:
1. Trust is earned gradually through accumulated experience, not granted in steps
2. Expert oversight is exception-based, not approval-based
3. The agent itself should modulate its own review requests based on task complexity/confidence
4. ~15% human review rate appears to be a practical equilibrium for mixed workloads

Sources: [Anthropic: Measuring AI Agent Autonomy](https://www.anthropic.com/research/measuring-agent-autonomy), [Adaptive HITL Architecture](https://www.researchsquare.com/article/rs-8952805/v1)

---

## Synthesis: Patterns That Apply to Agent OS

### Three distinct calibration mechanisms emerge

**1. Scheduled sampling (ISO 2859, skip-lot)**
- Review every Nth output, where N is earned through track record
- Uses streak-based trust: consecutive successes increase interval, any failure resets
- Best for: routine, repetitive processes with measurable quality

**2. Confidence-based routing (content moderation, AML, insurance STP)**
- Score each output on risk/confidence; route uncertain ones to humans
- Uses per-output assessment, not historical track record
- Best for: heterogeneous outputs where each one has different risk characteristics

**3. Anomaly detection (SPC, control charts)**
- Monitor quality metrics continuously; alert only on statistical anomalies
- Uses pattern recognition (trends, shifts, clustering) not individual thresholds
- Best for: detecting gradual degradation that per-output scoring would miss

### These three mechanisms are complementary, not competing

A well-designed system would use all three:
- **Confidence routing** decides per-output: does this specific output need review?
- **Scheduled sampling** provides baseline coverage: even high-confidence outputs get spot-checked at a rate determined by trust level
- **Anomaly detection** catches drift: if the agent's outputs are gradually degrading, the trend triggers increased oversight before individual failures are visible

### Trust state machine (derived from ISO 2859 switching rules)

```
                    10 consecutive clean
    TIGHTENED ---------> NORMAL ---------> REDUCED
       ^                   ^                  |
       |                   |                  |
       | 2-of-5 fail       | any failure      | any failure
       +-------------------+------------------+
       |
       | 5 consecutive fail under TIGHTENED
       v
    SUSPENDED (human must intervene to restart)
```

### Concrete numbers from real systems

| System | Auto-approve rate | Human review rate | What triggers review |
|--------|------------------|------------------|---------------------|
| Content moderation | ~85% auto-removed, ~10% auto-approved | ~5% uncertain band | Confidence score 0.3-0.7 |
| Insurance underwriting | 75-90% STP | 10-25% | Risk score, complexity, value |
| AML transaction monitoring | 65-85% auto-resolved | 15-35% | Risk score, rule triggers |
| AI agent interactions | ~85% autonomous | ~15% routed to human | Confidence + task complexity |
| ISO 2859 reduced inspection | Varies by AQL | ~30-50% of normal sample size | Earned through 10 consecutive lots |
| Skip-lot sampling | 60-80% of lots skipped | 20-40% of lots inspected | Earned through qualifying streak |

### The key insight for Agent OS

No real system uses a single dial. They all combine:
1. **Importance/severity classification** (what kind of thing is this?)
2. **Per-output confidence** (how sure are we about this specific output?)
3. **Historical track record** (how has this process/agent performed recently?)
4. **Adaptive state** (are we in normal, tightened, or reduced mode?)

The oversight frequency is the *product* of these factors, not any single one.
