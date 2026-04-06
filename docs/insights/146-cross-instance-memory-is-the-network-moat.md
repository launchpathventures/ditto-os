# Insight-146: Cross-Instance Person Memory Is the Network Moat

**Date:** 2026-04-05
**Trigger:** Gap analysis across AI SDR and networking platforms — no tool has cross-user relationship intelligence
**Layers affected:** L2 Agent, L4 Awareness, L5 Learning
**Status:** active

## The Insight

Every AI SDR tool surveyed (11x, Artisan, Clay, Apollo, Relevance AI) is single-tenant: each user's intelligence about prospects is isolated. Every networking platform (Lunchclub, Commsor, LinkedIn) matches on profiles, not on relationship history.

Ditto's shared person graph — where every interaction Alex has with Person A across every user compounds into richer understanding — is genuinely unique and creates a compounding network effect:

- User 1's outreach to Person A teaches Ditto what Person A cares about
- When User 2 needs to reach Person A, Ditto already has context
- Over time, Ditto knows the professional landscape better than any individual user could
- Every new user makes every other user's connections more valuable

This is the network moat. It's also the privacy challenge — person-scoped memory that serves the network without exposing individual users' private context to each other.

## Implications

1. Person-scoped memory (ADR-003 extension) is the most architecturally important addition for the Network Agent — more important than channel infrastructure.
2. Privacy architecture must be designed from day one: what about Person A is shareable across users? What's private to the user who generated it? The "public profile projection" model from the persona architecture applies here.
3. Memory assembly at introduction time must pull from: house-level person knowledge + user-specific relationship context. Two scopes, one prompt.
4. This creates a data flywheel: more users → more person interactions → better matching → better introductions → more users.

## Where It Should Land

ADR-003 extension (person scope). Brief 079 architecture section. Potentially a dedicated ADR for cross-instance memory privacy model.
