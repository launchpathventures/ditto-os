# Insight-167: Broadcast Is Supervised, Direct Is Autonomous

**Date:** 2026-04-09
**Trigger:** Brainstorming Alex's direct channel access (LinkedIn, X, etc.). The initial assumption was that all channel operations would follow the standard trust graduation (supervised → spot-checked → autonomous). But the risk profile of broadcast vs direct communication is fundamentally different, and the trust model should reflect that.
**Layers affected:** L2 Agent (tool execution, trust tiers), L3 Harness (channel-aware trust routing), L6 Human (approval patterns, alert design)
**Status:** active

## The Insight

The trust model for Alex operating the user's channels should be split by audience size, not graduated uniformly:

**Broadcast (posts, articles, content — seen by many) → Always supervised.** Alex drafts, user approves, Alex publishes. No graduation. The blast radius of a bad post (entire network sees it) is too high and too permanent to automate, regardless of how good Alex gets. The user's approval can become fast (glance, thumbs up, done) but it's always required.

**Direct (DMs, connection requests, 1:1 engagement — seen by one person) → Autonomous with earned trust.** Alex operates as a BDR: sends connection requests, opens conversations, warms prospects, qualifies interest. When the conversation reaches the point where the user's actual presence is needed (a call, a meeting, a decision), Alex alerts the user with a full briefing and hands off.

This maps to how real BDR/SDR teams work. The junior person does outreach and qualification. The senior person shows up to the warm conversation. The user never writes the first DM — they show up to the call.

**Why direct is low risk:**
- One person sees each message — a slightly off DM is one interaction, easily recovered
- DMs are conversational — natural back-and-forth allows course correction
- Connection requests are expected — a well-crafted one stands out, a mediocre one gets ignored, neither damages reputation
- The quality gate still runs on every message — house values, metacognitive checks, tone calibration
- The user can always review the full conversation thread — nothing is hidden

**The alert pattern when Alex hands off:**

Alex surfaces a prospect briefing, not just "someone replied." The briefing includes: who they are, what was discussed, what they're interested in, what they need, recommended next step, and the full conversation transcript. The user decides in 30 seconds whether to take the call, draft a custom reply, or let Alex continue.

## Implications

1. **Trust tiers need a channel-awareness dimension.** It's not just "what mode is Alex in?" but "what's the audience size of this action?" The same mode (selling) has different trust requirements for a LinkedIn post vs a LinkedIn DM.
2. **Alex-as-User on direct channels is the core product for sales.** This is where Alex generates the most value — handling the repetitive, awkward, time-consuming work of outreach and qualification so the user only shows up to warm conversations.
3. **The user's job shifts from "do outreach" to "take meetings."** Alex handles everything upstream of the actual human conversation. This is a fundamentally different value proposition than "AI writes your emails."
4. **Process templates for direct outreach need a "handoff trigger"** — the defined moment when Alex escalates from autonomous DM conversation to user alert. This trigger should be configurable but default to: meeting requested, pricing discussed, objection raised, or prospect asks to speak with the user directly.

## Where It Should Land

- `docs/architecture.md` — trust tier system needs channel-awareness as a dimension alongside mode-awareness
- `cognitive/modes/selling.md` — handoff triggers should be encoded as escalation conditions
- Process templates — `selling-outreach.yaml` should split into broadcast (content) and direct (DM/connect) variants with different trust defaults
- `docs/ditto-character.md` — the BDR analogy should be added to the mode spectrum section
