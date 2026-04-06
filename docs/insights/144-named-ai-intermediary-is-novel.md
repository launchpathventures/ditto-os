# Insight-144: Named AI Intermediary Is Novel

**Date:** 2026-04-05
**Trigger:** Research into AI SDR/BDR landscape and networking platforms for Brief 079 (Network Agent MVP)
**Layers affected:** L2 Agent, L3 Harness, L6 Human
**Status:** active

## The Insight

No existing AI SDR, outreach tool, or networking platform operates as a named intermediary with its own compounding reputation. Every tool in the market either ghostwrites (sends as the user — 11x, Artisan, Apollo) or is faceless (the platform matches algorithmically — Lunchclub, LinkedIn). Nobody has built "Alex from Ditto" — an AI character that makes introductions as itself, holds a professional identity, and accumulates trust capital with every good interaction.

This is the single most novel and highest-risk design decision in the Network Agent. If recipients trust "Alex from Ditto" the way they trust a human super-connector's intros, the network effect compounds: Alex's reputation becomes the reason people open the email, take the call, accept the intro. If they don't — if "an AI reached out to me" triggers spam instincts — the whole model breaks.

## Implications

1. The first emails Ditto sends are the most critical product moment. They must be so obviously high-quality and relevant that the "from an AI" framing becomes a positive signal, not a red flag.
2. Recipient experience design is as important as sender experience design. Every recipient is a potential future user.
3. The "from" line framing needs A/B testing early: "Alex from Ditto" vs "Ditto" vs "[User name] via Ditto" — each has different trust implications.
4. Ditto's email domain reputation IS the product. Deliverability infrastructure is not a technical detail — it's the moat.

## Where It Should Land

Character bible (`docs/ditto-character.md`). Brief 079 acceptance criteria. Potentially ADR candidate for "AI identity in external communications."
