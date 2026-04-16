# Insight-193: Continuous Capability Awareness

**Date:** 2026-04-16
**Trigger:** PM triage — GTM pipeline ready but invisible to users without explicit chat request. Cold start problem across all capabilities.
**Layers affected:** L2 Agent (Self context), L4 Awareness (capability gap detection), L6 Human (every surface)
**Status:** active

## The Insight

Alex should always know what the user COULD be doing that they're NOT. This isn't a suggestion tool that fires occasionally — it's a continuous awareness that manifests at natural moments throughout every interaction.

The current model treats suggestions as an afterthought: `suggest_next` caps at 2 per briefing, `coverage-agent` runs weekly, the Library is a passive catalog. The user must either ask Alex or explore the sidebar. A great EA doesn't have a weekly "suggestions meeting" — they weave awareness into every conversation: "Oh, while I have you — I noticed you've been doing X manually. Want me to handle that?"

**Seven dead ends where capability awareness should exist but doesn't:**

1. **Post-onboarding silence.** First process created → no "here are the 2-3 other things I'd set up for your business."
2. **Post-approval vacuum.** User approves a run → done. No "while that's running, I noticed you mentioned hiring — want me to set up candidate outreach?"
3. **Session-start is just status.** Briefing covers what happened and wedges in 1-2 suggestions at the end. Suggestions feel like afterthought, not main event.
4. **Library is a dead-end catalog.** Flat list of templates. No "recommended for you," no personalization, no relevance ranking.
5. **Trust upgrade misses expansion.** "Quoting is now autonomous" → Alex has more capacity but doesn't say "now I can take on follow-up sequences."
6. **New context doesn't trigger capability scan.** User says "we're hiring" → stored in user model → but Alex doesn't think "I have a candidate outreach template."
7. **Coverage-agent runs weekly.** By the time it finds gaps, the user has already formed habits.

**The design principle:** The Self's context should always include a compact "capability gap" — what the user has vs. what they could have, matched to their business context. This transforms suggestions from a tool into a pervasive behavior.

## Implications

1. **Self context assembly** needs a `<capability_awareness>` section: "User has 3 active processes (quoting, outreach, briefing). Missing for their business type: follow-up sequences, job scheduling. User recently mentioned: 'hiring is a mess' → candidate outreach template available." Compact (~200 tokens), always loaded.

2. **Trigger moments** beyond briefing: post-approval, post-milestone (trust upgrade), new-context-learned (user model updated), post-cycle-completion, post-onboarding. Each should inject a contextual signal that makes it natural for Alex to weave in awareness.

3. **Library personalization**: `getProcessCapabilities()` should return `relevanceScore` + `reasoning` per capability. "Recommended for your business" section at top. User sees what matters most to THEM, not a flat catalog.

4. **Today view**: Not just "what's happening" but "what could be happening." A "Recommended" section showing 2-3 capabilities matched to user context.

5. **Suggestion ceiling is wrong for early users.** Max 2 per briefing makes sense for established users. New users building their process portfolio need more aggressive capability surfacing — the whole point of the product is to show them what's possible.

## Where It Should Land

- Brief for Designer → Architect → Builder (interaction patterns, then implementation)
- Self context assembly in `self.ts` (capability gap section)
- Library personalization in `process-data.ts` + `compositions/library.ts`
- Cognitive self.md update (capability awareness guidance)
- Potentially new "recommended" composition for Today view
