# Insight-203: Self-Supervised Agent Dialogue

**Date:** 2026-04-20
**Trigger:** Architect conversation on integrating Paperclip's "hire a role" mechanic into Ditto — specifically the Self ↔ hired-agent relationship model.
**Layers affected:** L1 Process, L2 Agent, L6 Human
**Status:** absorbed into ADR-038 (2026-04-20). File retained in `docs/insights/` during Brief 201 build for reference; will move to `docs/insights/archived/` after Brief 206 ships.

## The Insight

**Self manages the hired agents. The user may converse directly with any sub-agent (e.g. the marketing manager). Self is always on the meta-channel, observing the transcript, and has standing authority to check and challenge — without being invited into the turn.**

This settles three questions at once that otherwise compete:

1. *Must all conversation route through Self?* — No. Direct specialist dialogue is efficient and the user should have it.
2. *Does Self lose primacy once agents exist?* — No. Self's role shifts from sole interlocutor to supervisor-of-specialists. Management is primacy.
3. *Where does governance sit when the user is talking to a specialist?* — On Self's observing channel. Self reads every turn, intervenes when stakes warrant, enforces trust gates on agent side-effects, and escalates when required.

The pattern is Ditto's existing **maker-checker** (Builder / Reviewer in the dev process) generalised from build-time to runtime conversation. Separation of context, fresh perspective, standing authority to challenge.

## Implications

### Architectural

- Every hired-agent conversation spawns a **Self-observer context** running alongside the agent's context. Both read the same transcript; each has its own working memory and perspective.
- Observation frequency is **trust-tier driven** (aligns with Ditto's attention model): new agent = every turn, earned agent = sampled + async digest.
- Self's interjection authority enumerates as five verbs: **ask** a clarifying question, **flag** a concern, **pause** via trust gate, **escalate** to user, **propose** an alternative.
- Agent is **aware of the observer** transparently — Self's notes arrive in agent context, no hidden surveillance. Preserves trust across the system.
- The user always speaks last on decisions. Self challenges, agent defends, user decides.

### UX

- A hired-agent conversation is a **three-voice surface**: user, agent, Self. Agent voice primary; Self's interjections visually distinct (different alignment, subtler typography, "observing"/"challenging" affordances).
- Challenges appear **inline** (user must see and respond). Routine observations appear on a **side channel** (ambient awareness without interruption). Silence-as-feature still applies.
- This is **Ditto-original UX** — no Paperclip equivalent. Paperclip's IssueDetail has one agent voice + operator comments. The continuously-observing, occasionally-interjecting Self has no prior art in their codebase.

### Relationship to existing Ditto machinery

- **Metacognitive-check handler** (existing harness handler) extends from internal step supervision to external conversation supervision. Same pattern, new surface.
- **Deliberative Perspectives** (ADR-028) — Self's challenge is a deliberative perspective on the agent's dialogue. The same primitive, applied at the agent layer.
- **Trust tiers** — governs observation rate (rate) and intervention threshold (form). Already codified.
- **Review pattern handler** — can enforce Self's check-before-side-effect on agent-proposed actions. Same handler, new caller.
- **Risk-detection-first-class** (Insight-077) — Self-as-always-watching is risk detection at the conversation layer.

### Ruled out

- Self as "one agent among many" — rejected. Self is the manager, not a peer.
- All user ↔ agent traffic routed through Self — rejected. Adds friction without adding safety; supervision on the meta-channel gives the safety without the tax.
- Hidden observation — rejected. Agents see that Self reads their transcript. Transparency across the system.

## Where It Should Land

When mature:

- **ADR-C: Self-Supervised Agent Dialogue** — codify the pattern as a named architectural decision (paired with ADR-B on the Hired Agents primitive).
- **`docs/architecture.md`** — update the Self description (L2 interface) and add the three-voice conversation model to the L6 human layer section.
- **`docs/human-layer.md`** — add "three-voice conversation" as an interaction pattern; describe the Self-observer affordances on Agent Card (primitive #10) and in the conversation surface.
- **`docs/dictionary.md`** — add entries for *Hired Agent*, *Self-observer*, *Interjection* (with the five verbs), distinguishing from existing *System Agent*, *Persona*, *Self*.
