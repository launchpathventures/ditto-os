# Insight-147: Recipient Experience Is the Growth Engine

**Date:** 2026-04-05
**Trigger:** Network Agent UX design — realising that every outreach email is simultaneously a marketing touchpoint for Ditto as a product
**Layers affected:** L6 Human, L5 Learning, L3 Harness
**Status:** active

## The Insight

In the Network Agent model, every recipient interaction serves two purposes: it's outreach on behalf of the user, AND it's the first experience a potential future user has with Ditto. The quality of what recipients experience directly determines whether the network grows.

This means recipient experience design is not secondary to user experience design — it's equally important. A beautifully designed user approval flow that produces mediocre outreach emails fails on both dimensions: the user doesn't get meetings AND Ditto's brand doesn't compound.

The growth loop is: great outreach → recipient trusts Ditto → recipient engages → recipient becomes user → their outreach reaches new recipients → network grows. Every link in this chain depends on the quality of what recipients experience.

## Implications

1. Outreach quality metrics (reply rate, meeting conversion, recipient satisfaction) are as important as user satisfaction metrics.
2. Ditto's email domain reputation IS the product. Deliverability infrastructure is a first-order design concern.
3. Reply handling must be exceptional — a dropped reply burns both the user's opportunity AND Ditto's reputation with that recipient forever.
4. The "from" line framing ("Alex from Ditto") must be tested early — recipient reaction to this determines the viability of the entire model.

## Where It Should Land

Brief 079 acceptance criteria. Character bible recipient section. Architecture: channel abstraction must treat outbound quality as a harness concern, not just a delivery concern.
