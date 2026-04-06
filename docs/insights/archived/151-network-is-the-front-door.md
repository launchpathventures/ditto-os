# Insight-151: The Network Is the Front Door

**Date:** 2026-04-05
**Trigger:** User feedback that the Ditto journey doesn't start with "install Ditto." It starts with a conversation — email, phone, message. Ditto meets people where they are. The workspace emerges later, when it's relevant.
**Layers affected:** L1 Process, L4 Awareness, L6 Human
**Status:** absorbed
**Absorbed into:** `docs/ditto-character.md` (onboarding journey — Meet Alex → Ditto → User Agent), `packages/web/app/welcome/ditto-conversation.tsx` (Alex speaks first on front door), `/api/network/intake` (email-first intake flow)

## The Insight

The Network Agent is not a feature of Ditto. It is potentially the primary way people discover and adopt Ditto.

The user journey has three layers, and people move through them naturally:

1. **Network participant** — Someone Ditto knows and has a relationship with. They've received outreach, gotten introductions, had conversations. They don't have a workspace. They may not even understand what Ditto is beyond "that useful connector." This is most people in the network.

2. **Active user** — Someone actively working with Ditto on sales or connections. They've had the intake conversation. They have a plan. Ditto is executing for them via email/voice/SMS. They may or may not have a workspace or the app.

3. **Workspace user** — Someone who has adopted Ditto as their chief of staff. Full product: processes, trust tiers, team management, the whole engine. The network agent is one capability among many.

The journey flows: network participant → active user → workspace user. But it can start anywhere and people can stay at any level indefinitely.

This means:
- The autonomous network nurture activity (Ditto reaching out, being useful, building relationships) is not a "future evolution" — it's how people MEET Ditto. It's the top of the funnel.
- Every recipient of a Ditto outreach is a potential network participant. Every network participant is a potential active user. Every active user is a potential workspace user.
- The workspace and the "chief of staff" concept are introduced at the right moment in the relationship — not upfront. It might be immediate for some users or months later for others.
- No app install, no signup form, no onboarding wizard is required to start getting value from Ditto.

## Implications

1. The product architecture must support users who exist only as relationships in Ditto's network — no workspace, no login, no app. Channel-native (email/voice/SMS) is the primary interface for these users.
2. The "onboarding" conversation (Brief 044, Brief 075) needs to be reframed: it's not the start of the Ditto journey, it's a milestone within an existing relationship. The real onboarding is the first useful thing Ditto does for someone.
3. Person-scoped memory is even more critical than previously understood. Every person in the network — user or not — needs a relationship record that compounds over time.
4. The workspace "reveal" is a design moment: Ditto recognises when someone would benefit from more structure and offers it naturally. "You know, there's a lot more I can help with beyond connections..."
5. Growth metrics should track network participants → active users → workspace users, not just signups.
6. The Ditto-autonomous network activity is not a later capability — it must be designed into MVP because it IS the acquisition channel.

## Where It Should Land

Top of the interaction spec (already being updated). Brief 079 as a fundamental architectural constraint. Potentially revises the personas document — the four personas (Rob, Lisa, Jordan, Nadia) describe workspace users, but the network participant layer is a new, broader audience. Character bible: the onboarding frame-setting conversation may not happen at first contact — it happens when someone is ready to become an active user.
