# Insight-076: The Self is a Proactive Attention Manager, Not Just a Suggestion Engine

**Date:** 2026-03-24
**Trigger:** User feedback during Phase 10 design: "A great personal assistant is always being proactive about suggesting focus, attention, opportunities for further coverage and work to be done"
**Layers affected:** L6 Human (Self behavior), Conversational Self (ADR-016), L4 Awareness
**Status:** active

## The Insight

The Self's proactive behavior is broader than suggesting new processes. A great assistant manages five dimensions:

### 1. Focus — "Here's what matters most right now"

Not just showing what needs attention, but actively prioritizing and explaining WHY something matters most:

> "Henderson quote is the one to do first — they called yesterday asking about it, and the Wilson quote can wait until tomorrow."

The Self doesn't just list items; it recommends an order and gives the reason. The user makes better decisions because the Self is synthesizing signals they'd otherwise have to gather manually.

### 2. Attention — "You might have forgotten about this"

Surfacing things that are slipping — not because they failed, but because they've gone quiet:

> "You haven't looked at the Wilson quote in 3 days. They're usually quick to respond — want me to follow up, or is there a reason to wait?"

The Self tracks what the user was tracking and nudges when something drops off their radar. This is the "nothing fell through the cracks" feeling — the core anxiety our personas carry.

### 3. Opportunities — "I noticed something you might want to act on"

Connecting dots the user might not connect:

> "Your competitor dropped their widget prices by 20%. Your tote bag uses the same material — you might want to check if your tote pricing is still competitive too."

> "Three customers asked about hot water systems this week. That's unusual — might be worth a targeted offer."

The Self observes patterns across the user's work and business context and surfaces actionable opportunities — not just problems.

### 4. Coverage — "Here's a gap you might not have noticed"

Identifying where the user's operation has blind spots:

> "You've got quoting and invoicing covered, but I notice job scheduling is still manual. That's usually where trades businesses lose the most time. Want to explore it?"

> "Your content process covers product descriptions but not the weekly email newsletter. Want me to handle that too?"

This is the maturity model / industry knowledge dimension — the Self knows what a business like theirs typically needs and proactively flags gaps.

### 5. Upcoming — "Here's what's coming up"

Forward-looking awareness:

> "Henderson's quote is 4 days old with no response. Normally you follow up after 3 days. Want me to send a nudge?"

> "You've got 3 jobs finishing this week. I'll have the invoices ready as they're done."

> "Quarter-end is in 2 weeks. Last quarter you spent a day pulling the numbers together. Want me to start gathering data now?"

The Self anticipates work based on patterns, schedules, and context — so the user doesn't have to remember.

## The Emotional Promise

The user should feel: "Nothing falls through the cracks. Opportunities don't get missed. I'm always working on what matters most." This is the feeling of having a brilliant executive assistant — someone who knows your business, your priorities, and your patterns, and proactively makes sure you're spending your time on the right things.

## Implications

- The Self needs temporal awareness: what's overdue, what's upcoming, what's aging
- The Self needs cross-process pattern recognition: connecting signals across different work streams
- The Self needs industry knowledge: what businesses like this typically need at each stage
- The Self's proactive messages need careful tone: helpful, not nagging. Offered, not demanded.
- Frequency control: the Self should not overwhelm with suggestions. One or two proactive nudges per session, prioritized by impact.
- The briefing (morning update) is the primary vehicle for proactive attention management — all five dimensions can be woven into the narrative briefing naturally.

## Where It Should Land

- **Phase 10 MVP brief** — Self's proactive behavior model, briefing intelligence
- **ADR-016** — extend Self's role to include the five proactive dimensions
- **Awareness layer (L4)** — temporal awareness, cross-process patterns, and gap detection feed the Self's proactive capability
