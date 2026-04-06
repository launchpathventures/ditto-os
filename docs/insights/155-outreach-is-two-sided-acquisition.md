# Insight-155: Every Outreach Email Is a Two-Sided Acquisition Channel

**Date:** 2026-04-06
**Trigger:** Designing the verify page and referred path for the web acquisition funnel. Realised that every Alex email creates two conversion opportunities, not one.
**Layers affected:** L6 Human (verify + referred pages), L3 Harness (email footer template), L5 Learning (verify conversion tracking)
**Status:** active

## The Insight

Every email Alex sends serves the user who requested it AND is simultaneously a product demo for the recipient. This creates a two-sided acquisition channel:

1. **The sender's side:** Alex works their network, books meetings, makes introductions. Direct value.
2. **The recipient's side:** The recipient experiences Alex's quality. If impressed, they can verify trust (→ `/verify`) and become a user themselves (→ `/welcome/referred`).

The verify page is the trust bridge. The referred page is the conversion point. Together they turn every successful outreach into a potential new user — the network effect that makes Ditto's model compound.

This extends Insight-147 (recipient experience is the growth engine): the verify page is where recipient trust converts to user acquisition.

## Implications

1. Outreach email quality directly affects user acquisition rate. Bad emails don't just fail for the sender — they kill the growth loop.
2. The email footer link ("Want your own advisor?") must be present in every outreach but must not compete with the outreach's primary purpose.
3. The verify page must be anti-enumeration (no information oracle) while still building trust. The inbox-confirmation pattern solves this.
4. Referred page conversion should be tracked as a first-class growth metric, not an afterthought.
5. Alex's reputation IS the growth engine. Protecting it (house values, refusal patterns) is not just ethical — it's the business model.

## Where It Should Land

Brief 095 implementation. Outreach email template system. Growth metrics dashboard (future). ADR-025 should reference this insight in the "Consequences" section.
