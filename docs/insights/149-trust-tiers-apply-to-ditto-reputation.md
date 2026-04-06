# Insight-149: Trust Tiers Apply to Ditto's Own Reputation

**Date:** 2026-04-05
**Trigger:** Network Agent recipient experience design — recognising that Ditto's relationship with each recipient follows the same progressive trust pattern
**Layers affected:** L3 Harness, L5 Learning
**Status:** active

## The Insight

Ditto's progressive trust model (supervised → spot-checked → autonomous) describes how users delegate to Ditto. But the same pattern applies to how recipients relate to Ditto:

- **First outreach = "supervised"** — recipient evaluates carefully. Who is this? Is this spam? Why should I care?
- **After 2-3 good touchpoints = "spot-checked"** — recipient opens Ditto's emails by default. "Ditto usually sends good stuff."
- **After consistent quality = "autonomous"** — recipient actively wants to hear from Ditto. "When Alex reaches out, I pay attention."

This means Ditto's outreach to any given recipient should be calibrated to the trust tier of THAT RELATIONSHIP, not just the user's trust tier with Ditto. A first contact with a new recipient is always "supervised" from the recipient's perspective — even if the user trusts Ditto autonomously.

The trust tiers per-recipient also explain why refusals protect the system: a bad outreach to someone at "spot-checked" trust drops them back to "supervised" or worse. A bad outreach to someone at first-contact trust means they'll never engage with Ditto again.

## Implications

1. The relationship graph needs a Ditto↔recipient trust edge, not just user↔recipient. This trust score should govern outreach frequency, tone, and boldness.
2. First contacts should always be more conservative than follow-ups — lower pressure, more context, easier opt-out.
3. The pre-send review gate ("would this be welcomed?") should factor in the recipient's trust tier with Ditto, not just message quality.
4. Fatigue scoring (how often Ditto has contacted someone, across all users) prevents any single recipient from being over-contacted even if multiple users target them.

## Where It Should Land

Brief 079 architecture section. ADR-007 extension (trust earning applied to external relationships). Relationship graph schema design.
