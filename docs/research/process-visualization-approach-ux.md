# Process Visualization Approach — UX Design Analysis

**Date:** 2026-03-26
**Status:** Design challenge — evaluating linear narrative vs node-graph process visualization
**Triggered by:** User comparison of v45 (linear "How it works" card) vs v44 (node-based workflow DAG)
**Human jobs served:** Orient, Define, Decide

---

## The Question

Should the "How it works" process visualization use a **linear narrative** (numbered steps with dots/lines) or a **node-based graph** (connected cards with branching paths)?

Two reference images:
- **v45** (current): Numbered steps — "1. I draft 5 Instagram posts weekly → 2. You review and correct each post → 3. I learn from your corrections and improve" — with settings controls below
- **v44** (proposed alternative): Node-graph DAG — Process Data → Decision Point → Success Path / Error Path → Complete — with connector lines and branching

---

## Design Challenge: This Is Two Different Primitives

The core issue is that v44 and v45 serve **different design purposes** at **different scales**. Conflating them would mean choosing the wrong tool for the wrong job.

### What v45 Does (Linear Narrative — Process Detail)
- **Primitive:** Part of the Process Card / Process Detail view (Primitive 2 expanded)
- **Human job:** Orient — "How does this process work?"
- **Scale:** Inside ONE process — explaining its steps to the user
- **Audience:** Rob reviewing his quoting process. Lisa understanding her content process. Non-technical users.
- **Design intent:** A person who doesn't know what a "workflow" is can read this and understand what happens

### What v44 Does (Node Graph — Process Graph)
- **Primitive:** Process Graph (Primitive 14)
- **Human job:** Decide — "How does my business actually flow?"
- **Scale:** Across MULTIPLE processes — showing how they connect
- **Audience:** Jordan demoing to leadership. Nadia seeing her team's process health.
- **Design intent:** A systems-level view that emerges only after multiple processes exist

These are not interchangeable. They serve different moments in the emotional journey:
- v45 appears in **Week 1** (Act 2 — Building Confidence) — when the user has 1-2 processes
- v44-style views appear in **Month 3+** (Act 4 — Compound Effect) — when the user has 4+ processes

---

## The Persona Test

### Rob (trades MD, on his phone between jobs)
- **v45 linear narrative:** "Quote request comes in → I gather specs → Draft the quote → You review → Send to customer." Rob reads this in 10 seconds on his phone. He knows exactly what happens. ✅
- **v44 node graph:** Nodes, connectors, branching paths, "Decision Point: Route based on conditions." Rob sees boxes and arrows. He thinks "this is IT software, not for me." On a 375px screen, the horizontal DAG is unusable. ❌

### Lisa (ecommerce MD, between warehouse and desk)
- **v45:** "1. Product added to catalogue → 2. I write the description using your brand voice → 3. You review and edit → 4. Published to Shopify." Lisa nods. She gets it. ✅
- **v44:** "Process Data → Decision Point → Success Path / Error Path." Lisa asks: "What does 'Decision Point' mean? What's an error path?" ❌

### Jordan (generalist technologist)
- **v45:** Useful for explaining any single process to the department head who requested it. ✅
- **v44:** Useful when showing leadership the **cross-process** view in month 2+. ✅ — but at the process-to-process level, not intra-process

### Nadia (team manager)
- **v45:** "Here's how the report formatting process works for your team." Clear, scannable. ✅
- **v44:** Useful for seeing how formatting → reporting → quarterly review connect. ✅ — again, inter-process only

---

## The Anti-Persona Test

From `personas.md`:

> **The Workflow Designer** — Someone who thinks in boxes and arrows, enjoys visual programming tools, and wants to design complex conditional logic. They'd be better served by n8n, Retool, or custom code.

The v44 node graph is **exactly** what the Workflow Designer wants. That's the anti-persona. If our primary process detail view looks like n8n, we're building for the wrong person.

From the persona definition of outcome owners:

> They are not workflow designers. They won't draw boxes and arrows to define automation.

---

## The Extensibility Question

The user's concern is valid: the linear narrative doesn't obviously handle:
1. **Branching** (urgent vs standard quotes)
2. **Parallel steps** (gather pricing AND check stock simultaneously)
3. **Error handling** (what if the supplier API is down?)
4. **Complex multi-path processes**

But the design philosophy answers this:

### Principle: The system handles complexity, the human sees simplicity

From `human-layer.md`:
> AI limitations are the platform's problem.

Branching, parallelism, and error handling are **engine concerns** (Layers 2-4), not human concerns (Layer 6). The user doesn't need to see that the quoting process checks pricing in parallel — they need to know "I gather specs and current pricing." The engine handles the how. The human sees the what.

### Progressive disclosure handles growth

When a process IS genuinely complex (e.g., Delta Insurance underwriting with triage → decline/flag/quote paths), the linear narrative can evolve:

```
1. Submission comes in
2. I triage it — decline, flag for review, or proceed to quote
   ├─ Declined: notification sent with reason
   ├─ Flagged: appears in your review queue
   └─ Proceed: I prepare the quote (step 3)
3. I prepare the quote using your pricing model
4. You review
5. Sent to broker
```

This is still readable, still narrative, but handles branching through **indented sub-paths** rather than a node graph. The user sees the process as a story with forks, not as a DAG to parse.

---

## Where Node Graphs DO Belong

The Process Graph (Primitive 14) in `human-layer.md` IS a node-based visualization — but at the **inter-process** level:

```
[Customer Enquiry] → [Quoting] → [Follow-up]
                          ↓
                    [Invoicing]
```

Each node IS a Process Card. Click to expand. Health-colored. Animated flow. This is where the v44 approach has merit — but even here, it must be:
- **Humanized** (not "Decision Point: Route based on conditions" but process names the user defined)
- **Health-focused** (green/amber/red nodes) not logic-focused
- **Glanceable** (not requiring graph-parsing literacy)
- **Available only when it earns its complexity** (month 2+, 3+ processes)

---

## Recommendation

| Surface | Visualization | Rationale |
|---------|--------------|-----------|
| **Process Detail** ("How it works") | **Linear narrative** (v45 approach) | Serves Orient job. Readable by all personas. Mobile-friendly. No jargon. |
| **Process Builder** (Define mode) | **Structured list** (Primitive 9) | Power-user editing view. Still sequential, but with rich metadata per step. |
| **Process Graph** (multi-process) | **Node graph** (v44 approach, humanized) | Serves Decide job. Jordan's demo view. Nadia's team view. Inter-process only. |

### For the Process Detail view specifically:
1. **Keep the linear narrative** as the primary "How it works" visualization
2. **Enhance it** to handle branching through indented sub-paths (not nodes)
3. **Add "who does what" labels** (v45 already has Ditto/You badges — good)
4. **Show current state** (v45's active step indicator — good pattern)
5. **Never expose engine-level complexity** (parallel execution, error handling, retry logic)

### For the eventual Process Graph:
1. Use node-graph approach but with **process names, not technical labels**
2. Nodes are Process Cards (clickable, health-colored)
3. Edges show data flow, not control flow
4. No "Decision Point" or "Error Path" labels — those are engine internals
5. Design separately — don't retrofit the process detail view

---

## Interaction States (for Process Detail "How it works")

| State | What the user sees |
|-------|-------------------|
| **Empty** | "We'll map out how this works as you describe it" (during conversation-first setup) |
| **Building** | Steps appear one by one as the conversation fills them in |
| **Active** | Steps show complete/active/pending with current state indicator |
| **Running** | Active step pulses subtly — the process is working right now |
| **Paused** | "Waiting for you" on the human review step |
| **Error** | Failed step highlighted with plain-language explanation |

---

## Gaps / Original to Ditto

- **Indented sub-path notation** for branching within a linear narrative — no existing product does this well for non-technical users. Most branch visualizations default to DAGs. This is a Ditto-original pattern that needs prototyping.
- **Animated step progression** showing a process running in real-time within a linear view — most tools either show static state or use complex timeline views.

---

## Reference Docs

- Reference docs checked: `personas.md` (anti-persona section confirms), `human-layer.md` (Primitive 2, 9, 14 distinction holds), `architecture.md` (process-as-primitive — the internal structure is engine-managed)
- No drift found in reference docs
