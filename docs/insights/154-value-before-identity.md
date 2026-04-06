# Insight-154: Value Before Identity Is the Universal Conversion Pattern

**Date:** 2026-04-06
**Trigger:** UX research for web acquisition funnel — every high-performing conversational front door (Formless.ai, Replit, Drift, Perplexity, Boardy) demonstrates value before requesting identity.
**Layers affected:** L6 Human (front door), L2 Agent (Alex front-door behaviour)
**Status:** active

## The Insight

The strongest product onboarding patterns let users experience value before asking for email or signup. Replit lets you generate code without an account. Perplexity answers your question before asking you to register. Formless.ai captures data through conversation, not through forms.

For Ditto, Alex's conversational intelligence IS the value demonstration. The conversation is the product sample. When a visitor talks to Alex and gets a smart, specific, character-consistent response, they've experienced what Ditto does. The email ask that follows is confirmation of interest in something they've already felt — not a gate to something they haven't seen.

This inverts the traditional funnel: instead of "pitch → gate → value", it's "value → natural ask → deeper value."

## Implications

1. The front door conversation must be genuinely useful, not a scripted qualification flow. Alex must respond with real intelligence — not canned replies.
2. The email ask must emerge naturally from conversation context, not appear at a hardcoded turn number.
3. Error states must still provide value — if the chat API fails, fall back to email form, never a dead end.
4. This principle extends to every Ditto surface: the workspace should demonstrate value in the first session before asking users to define processes.

## Where It Should Land

Brief 093/094 implementation. Front-door system prompt design. Future onboarding brief for workspace first-run experience.
