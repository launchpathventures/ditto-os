# Insight 172: Cognitive Orchestration Over Prescriptive Processes

**Status:** Active
**Emerged from:** Journey stress test + process template audit (Brief 126 session)
**Affects:** All process templates, Self orchestration, heartbeat execution model

## The Discovery

We built cognitive modes (connecting, selling, ghost, chief-of-staff) that encode HOW Alex thinks — optimisation targets, silence conditions, refusal patterns, judgment frameworks. Then we wrote process templates that are fixed step sequences: gather → research → draft → quality gate → send → report. The cognitive modes give Alex a brain; the process templates give him a script.

A real advisor doesn't follow a script. They think: "This person mentioned accountants but seemed uncertain — maybe I should clarify before researching. They already shared their website so I don't need to ask. They're in Melbourne so I should focus there. Actually, they seem overwhelmed — maybe I should start with the CoS briefing, not outreach."

## The Principle

**Process templates should be capability declarations (tools + gates), not step sequences.** The Self drives orchestration using cognitive modes. Process templates declare:

- **What tools are available** (web search, email sending, person research, process spawning)
- **What gates are non-negotiable** (quality gate, opt-out check, trust tier enforcement)
- **What trust tier applies** (supervised, spot-checked, autonomous, critical)
- **What the success criteria are** (not step completion, but outcome achievement)

The Self decides:
- **What to do first** (research? ask for details? search? draft?)
- **When to switch media** (email → chat escalation via magic link)
- **When to stay silent** (cognitive mode silence conditions)
- **When to adjust strategy** (results-based learning, user feedback)
- **What cadence to use** (when there's something worth saying, not day 2/4/7)

## What This Changes

| Before (prescriptive) | After (cognitive) |
|----------------------|-------------------|
| 6-step fixed sequence in YAML | Capability set + gates in YAML, Self decides sequence |
| Day 2/4/7 nurture cadence | "When Alex has something worth saying" |
| Touch 1 = angle, Touch 2 = proof, Touch 3 = close | "What adds value for THIS person NOW?" |
| Separate processes for intake, nurture, follow-up | Self has all tools, gates enforce quality, modes guide judgment |
| Chain triggers fire fixed processes | Self decides what to do next based on what happened |

## What Stays The Same

- Quality gates (non-negotiable safety checks)
- Trust tiers (graduated autonomy)
- Opt-out enforcement (permanent silence)
- Feedback recording (every decision captured)
- Cognitive modes (judgment frameworks)
- The harness pipeline (handlers, review patterns)

## How To Apply

When writing a process template, ask: "Am I describing what Alex CAN do, or what Alex MUST do in order?" If the latter, move the sequencing to Alex's cognitive judgment and keep only the capability declaration + gates.

## Anti-Pattern

```yaml
# BAD: prescriptive sequence
steps:
  - id: research
  - id: draft
    depends_on: [research]
  - id: quality-gate
    depends_on: [draft]
  - id: send
    depends_on: [quality-gate]
```

```yaml
# GOOD: capability set with gates
capabilities:
  - web-search
  - web-fetch
  - draft-email
  - send-email
  - record-interaction

gates:
  - quality-gate (before any outbound)
  - opt-out-check (before any contact)

trust: autonomous
mode: connecting
```

The Self knows how to use these capabilities because its cognitive mode (connecting) tells it: optimise for mutual value, be specific, don't spam, refusal when tests fail.
