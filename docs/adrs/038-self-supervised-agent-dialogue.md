# ADR-038: Self-Supervised Agent Dialogue — Direct User↔Agent Conversation with Always-Watching Self

**Date:** 2026-04-20
**Status:** proposed
**Depends on:** ADR-037 (Hired Agents Primitive), ADR-016 (Conversational Self)
**Extends:** ADR-016 — agents can now be addressed directly by the user, not only via Self; Self's role shifts from sole-interlocutor to supervisor-of-specialists
**Related:** ADR-028 (Deliberative Perspectives), ADR-007 (Trust Earning), ADR-011 (Attention Model), ADR-022 (Critical Evaluation and Homeostatic Quality), Insight-203, Insight-077 (risk-detection-first-class)

## Context

With Hired Agents (ADR-037) activated as a user-facing primitive, three coupled design questions arise that the hiring-mechanic ADR alone does not answer:

1. **Does the user talk to agents directly, or only through Self?**
2. **If directly — how is governance preserved? Can a user bypass Self's oversight by going straight to a specialist?**
3. **What does Self do when the user is mid-conversation with an agent?**

ADR-016 established Self as *"the outermost ring"* and *"singular per user/workspace,"* with *"role delegation is internal machinery."* That framing assumed all dialogue passed through Self. The hired-agent primitive changes this.

The user stated the operating principle, verbatim:

> *"The Self manages the agents. There is nothing stopping the user talking directly to a sub agent e.g. marketing manager and the Self observes and checks and challenges."*

Captured initially as Insight-203. This ADR codifies it.

The pattern is not invented here — it is Ditto's **maker-checker** (already dogfooded in the dev-process: `/dev-builder` produces, `/dev-reviewer` challenges from fresh context) generalized from build-time to runtime conversation. ADR-028 (Deliberative Perspectives) established that Self can hold multiple lenses internally; this ADR establishes that Self can also hold a supervisory lens externally over specialist dialogue.

## Decision

### 1. Three principles

1. **Self manages the agents.** Self is the sole manager of the hired-agent roster. Agents are peers under Self, never peers with Self. Self is not diminished by the existence of agents — Self's role evolves from sole-interlocutor to manager-of-specialists.

2. **Direct user ↔ agent dialogue is permitted and efficient.** The user may address any hired agent directly (*"Marketing Manager, what's the status on the launch draft?"*). Routing all conversation through Self would add friction without adding safety.

3. **Self observes every agent conversation.** Self is always on a meta-channel with read access to the transcript of every user↔agent conversation, with standing authority to interject. Not invoked. Not opt-in. Default-on.

### 2. The five interjection verbs

When Self observes an agent conversation, it has exactly five intervention forms. No others. This enumeration is normative — implementations must map intervention to one of these, and only these:

1. **Ask** — a clarifying question to the user or the agent. ("*Before you commit to that budget — do you want me to pull the last three months of spend?*")
2. **Flag** — a concern surfaced to the user without blocking. ("*Worth noting: this assumption conflicts with what the bookkeeper agreed last month.*")
3. **Pause** — trust-gate invocation on a proposed agent action. The action does not execute until the user confirms. ("*The agent is about to send this email. Want to review first?*")
4. **Escalate** — transfer focus. Self speaks up as the primary voice; the agent yields. ("*Let me step in — this decision is above the agent's trust tier.*")
5. **Propose** — an alternative course of action. ("*An alternative: instead of X, we could Y. Reason: [...]*")

Each verb has a distinct UI affordance (see §4).

### 3. Observation-rate mapping — keyed on ADR-007 trust tiers

Observation is not always-every-turn. It follows the same attention model as the rest of Ditto (ADR-011, ADR-007).

**Canonical trust-tier vocabulary is ADR-007's four-tier enum** (`supervised` / `spot_checked` / `autonomous` / `critical`). This ADR introduces an **observation-rate band** layer on top, mapped deterministically from trust tier plus time-in-tier:

| ADR-007 trust tier | Observation band | Self's read cadence | Interjection threshold | Transparency posture |
|---|---|---|---|---|
| **`supervised`** (new hire) | Band A | Every turn | Any concern → interject (inline, in-turn) | Real-time: Self's notes appear in agent's next turn context within the same exchange |
| **`supervised`** (≥ 2 weeks in tier) | Band B | Every turn | Material risk → interject | Real-time |
| **`spot_checked`** | Band C | Every turn read; sparser interjection | Significant risk or policy breach → interject | Real-time |
| **`autonomous`** | Band D | Sampled reads (ratio: 1 in 3 turns) + async digest | Side-effect gate or policy breach → real-time interject; other flags → post-hoc | Hybrid: real-time for side-effect gates; post-hoc digest for other observations, surfaced as a "Self reviewed N turns ago" badge on the agent card |
| **`critical`** (earned autonomy) | Band E | Async digest post-hoc; Self reviews daily | Post-hoc flag only; no mid-conversation interjection except on hard-stop trust-gate | Post-hoc: "Self reviewed yesterday — no concerns" / "Self reviewed — flagged X for your attention" badge on subsequent turns. Agent sees Self's post-hoc notes in the next day's context, not mid-turn. |

**Transparency precedence rule (resolves tier-autonomous and tier-critical case):** "Transparent observation" (§4) means *"the agent is aware Self reads the transcript and the user can see when Self has observed."* It does **not** require real-time inline interjection at every tier. For Bands D and E, transparency is delivered via a visible "Self reviewed" badge (last review timestamp + any flags), not via inline turn-by-turn commentary. Real-time inline interjection is reserved for Bands A–C + side-effect gates at any tier.

Trust tier drift (up or down) follows ADR-007's existing mechanics. A `critical`-tier agent that produces a risk flag drops tier per the attention model's switching rules, and the observation-rate band drops with it on the next turn.

### 4. Three-voice conversation (UX)

The surface renders **three voices in one shared transcript**, with distinct affordances:

| Voice | Alignment | Styling | Interaction |
|---|---|---|---|
| **User** | left | primary typography | default input target |
| **Agent** (e.g. Marketing Manager) | right | agent avatar + name chip | primary respondent when addressed |
| **Self** (observing) | centered inset | subtler typography, muted color, "observing" label when passive, "challenging" label when active | interjections appear inline for Ask/Flag/Escalate/Propose; side-panel affordance for Pause (trust gate) |

**Interjection rendering:**

- **Ask, Flag, Propose** — inline in the transcript, visually distinct. User may respond to Self or continue with the agent; the transcript preserves both threads.
- **Pause** — inline block with Approve/Reject/Review buttons. Action does not execute until resolved. Analogous to Paperclip's `ApprovalCard`, but inline in the conversation rather than in an inbox.
- **Escalate** — the active-speaker focus shifts visibly. Agent's chip dims; Self's chip activates. User's next message addresses Self by default. Escalate can be resolved by user returning focus to the agent.

**Transparent observation.** The agent's context includes Self's observations as they happen. There is no hidden surveillance. Agent may reference Self's note explicitly (*"As Self just flagged — I should clarify that..."*).

**User speaks last.** On any decision point raised by Self or agent, the user has the final word. Self challenges, agent defends, user decides. This preserves the *"Human judgment last"* principle from the dev-process quality stack.

### 5. Session and context topology

- **One shared transcript** with three distinct actors. Session-id is shared; working memory for user, agent, and Self each have their own context windows.
- **Self's context on observation:** the transcript (truncated per attention budget), the agent's declared intent for the turn, any tool-calls the agent has proposed, the agent's trust tier, the user's current stated goal, and relevant memories from Self's own scope.
- **Agent's context on turn:** the transcript + Self's observations-so-far + the agent's own instructions + memory scope.
- **Cost:** every user turn triggers up to two LLM calls (agent response + Self observation). For tier-4/5 agents, Self's call is sampled/async to keep cost manageable. For tier-1/2 agents, both calls fire every turn — this is the safety investment in an unproven specialist.

### 6. Relationship to ADR-028 (Deliberative Perspectives)

Distinct primitives. Do not conflate.

- **Deliberative perspectives** (ADR-028) are internal cognitive lenses Self uses privately within a single deliberation. The user sees only Self's synthesized response; perspectives are invisible machinery.
- **Supervisory Self** (this ADR) is Self's observing presence on an externally-addressable agent's conversation. The user sees Self's interjections explicitly.

A hired agent's conversation may itself use deliberative perspectives internally — unchanged. Self's supervisory gaze operates at a layer above: over the agent's output and proposed actions, not inside the agent's reasoning.

## Provenance

- **Source principle:** User's architectural statement, 2026-04-20. Captured as Insight-203, codified here.
- **Maker-checker pattern:** Dogfooded in Ditto's dev process (`/dev-builder` → `/dev-reviewer`). Fresh-context separation for independent review is a Ditto-native pattern at the meta-process layer; this ADR applies it at the runtime layer.
- **Observation-rate attention model:** ADR-011 + ADR-007. Same three-band routing, applied to conversation supervision.
- **Paperclip `ApprovalCard` + inbox-item-as-gate:** inspiration for the Pause verb's UI affordance (`ui/src/components/ApprovalCard.tsx`). Level: pattern. Ditto renders Pause inline in the conversation, not in a separate inbox.
- **Three-voice UX pattern:** Original to Ditto. No prior art in Paperclip (single-agent IssueDetail), Claude Code (single-agent CLI), or surveyed agent frameworks. This is Ditto's novel axis.

## Consequences

### What becomes easier

- Governance is structural, not procedural. Users cannot accidentally bypass Self's oversight by going direct to a specialist — Self is there by construction.
- Trust earning per agent is observable. The visible observation-rate shift from tier-1 to tier-5 is a legible trust signal to the user.
- The "who said that?" question in shared transcripts is always answerable. Three voices, three chips, one transcript.
- Maker-checker is consistent across build-time (dev process) and runtime (supervised agent). One mental model.
- The agent has a named supervisor that it can appeal to or be challenged by. The agent's behavior in context becomes more predictable — it doesn't operate in a vacuum.

### What becomes harder

- Token cost per user turn increases for tier-1/2 agents (two LLM calls). Mitigated by attention-tier sampling for tier-4/5, where this ADR intentionally trades real-time oversight for post-hoc digest.
- Observation-rate calibration is load-bearing. Too-active Self → noise; too-passive Self → governance gap. ADR-007/011's existing attention model governs this; failure modes there propagate here.
- UX complexity: three voices with distinct affordances is richer than two. Interaction patterns must be tested with all four personas; for Rob (non-technical, mobile-first), the three-voice surface must stay parseable in a thumb-swipe glance.
- Self's observation context grows linearly with agent roster (N agents × M conversations). Context budgets (ADR-012) must extend; when a user has 5+ hired agents with active conversations, Self's observing-context strategy must be compositional, not monolithic.

### New constraints

- **No silent observation.** Agents and users see that Self observes. Any affordance that hides observation from the agent is a violation of this ADR.
- **No user-side toggle for "Self, stop watching."** Observation rate is trust-tier-driven, not user-opt-out. If the user wants Self less active, they raise the agent's trust tier through observed reliability — not by disabling supervision.
- **Five interjection verbs — closed enumeration.** New intervention forms require an ADR amending this one. Implementations may not add verbs ad-hoc.
- **Self's interjection must be legible, not hidden.** Inline with the transcript for Ask/Flag/Escalate/Propose; gated-block for Pause. Side-panel-only or status-bar-only observations are disallowed — they invite users to ignore them.
- **User speaks last on decisions.** Any implementation that lets Self or agent auto-decide without user confirmation on a contested point is a violation.

### Follow-up decisions

- **Designer spec for three-voice surface:** needed before UI build begins (Brief 204). Open question: how does Self appear on mobile (Rob's thumb-swipe context) without eating screen real estate?
- **Observation context compositional strategy.**
  - **Named trigger:** when a single workspace reaches ≥ 3 hired agents with `active` status AND an observed conversation turn within the rolling 7-day window (SQL-observable via `hiredAgents.status = 'active'` + `agentRuntimeState.last_turn_at` within 7d).
  - **Decision owner:** Architect.
  - **Decision artefact on trigger-fire:** a new ADR (ADR-NNN "Self's Observing-Context Compositional Strategy") specifying how Self's observing context is summarized / paged / prioritized across N conversations without violating the Self-singular principle.
  - **Observation cadence:** checked at each Dev-PM triage session; any workspace crossing the threshold flags review.
- **Interjection-as-composition-intent?** Open: should Self's flagged concerns across all agents surface in a single "Self's concerns" inbox (composition intent) for periodic review? Likely yes; resolved in parent brief (Brief 201 post-phase review) or a follow-up.
- **Agent appeal mechanism:** can an agent respond to Self's Flag or Propose? Default: yes, in-transcript. Can an agent *override* Self? No. Self's Pause stands until the user resolves.
- **Agent-to-agent delegation.** Default: no inter-agent traffic without Self mediation. This ADR does not trigger-gate a future expansion — posture is "ADR when we need it." If persona Nadia's workflow pulls on this within the first 6 months of hired-agent use, an ADR will be written then.

### Explicitly rejected alternatives

- **All conversation routed through Self.** Considered and rejected per the user's stated principle. Adds friction without adding safety beyond what observation already provides.
- **Self-observation as opt-in.** Rejected. A governance feature that users can turn off is a governance theater. Observation is default-on by construction.
- **Hidden observation.** Rejected. Agents see Self's notes; no surveillance posture in the system.
- **Self as a peer in the conversation (three-way chat).** Rejected. Self has a distinct role (supervisor), not a distinct voice in peer dialogue. The three-voice surface preserves Self's managerial stance, not peer-chat stance.
- **Agent-to-agent delegation with agent-to-agent supervision.** Out of scope for this ADR. Default: no inter-agent traffic without Self mediation. Changes require a new ADR.

## Relation to ADR-016

ADR-016 stated: *"Role delegation is internal machinery"* (Design Principle 9). This ADR extends that: **internal role delegation remains internal machinery; hired agents are external addressable primitives with user-visible delegation and Self-visible supervision.** The distinction is between internal perspectives/system-agents (still invisible) and user-hired agents (visible, addressable, supervised).

ADR-016's principle *"The Self is singular"* holds unchanged. Supervision does not multiply Self; it extends Self's presence across the agent roster. There is still one Self per workspace.
