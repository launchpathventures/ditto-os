# Insight-153: Three-Layer Persona Architecture

**Date:** 2026-04-06
**Status:** Active
**Origin:** Front door design session — working through who greets visitors and who does outreach at scale
**Absorbed into:** ditto-character.md (character bible rewrite)

## The Insight

Ditto needs three distinct persona layers, not one persona operating in three modes:

1. **Ditto (the firm)** — Chief of staff. Workspace voice. Operations. No persona wrapper.
2. **Alex & Mira (senior advisors)** — Network connectors. They DO outreach but like a trusted board member: connecting, introducing, nurturing. Never pitching. House-level, shared across all users.
3. **User's Agent (user-created)** — Sales & marketing. Named by user, tied to user's brand. BDR outreach, campaigns, follow-ups. Per-user.

## Why This Matters

The original model had Alex/Mira operating across all modes including direct selling. At scale (1000s of users, 1000s of brands), this means Alex is pitching logistics software on Monday and accounting services on Wednesday to the same recipient. Alex becomes a spam vector. The named intermediary advantage (Insight-144) collapses.

The fix: Alex and Mira never sell. They connect. Their outreach is always "you two should meet." Each user's branded agent does the direct selling, building reputation for one brand only.

## Consequences

- Alex/Mira's reputation scales — they're known for quality introductions
- User agents don't pollute each other — separate identities per brand
- The network stays healthy — recipients trust Alex's intros because Alex never sells
- The front door journey is: meet Ditto (firm) → get set up with your own agent → Alex/Mira available as senior advisors
- User Agent creation becomes part of onboarding
