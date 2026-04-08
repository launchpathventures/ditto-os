# Insight-164: Alex Acts as a Professional, Not an Assistant — Consent to Act, Not Approval Per Action

**Date:** 2026-04-08
**Trigger:** User journey battle-test revealed the Connector path was framed as "Alex drafts on behalf of user, user approves each draft." But a real advisor doesn't work this way. A real advisor gets consent to act, then uses their own social credibility, judgment, and reputation to execute. The user trusts the advisor, not each individual email.
**Layers affected:** L1 Process (front-door-intake redesign), L2 Agent (Alex's autonomy model), L3 Harness (trust context enforcement), L6 Human (bespoke signed review pages)
**Status:** active

## The Insight

The front-door-intake process currently has a `user-approval` human step where Alex sends draft introductions to the user for line-by-line approval before anything goes out. This makes Alex feel like a secretary, not an advisor.

**How a real advisor works:**

1. Gets to know you and what you need (the front door conversation)
2. Gets your consent to act: "I'll reach out to some property managers on your behalf. I'll position you as a quality residential painter. Sound good?"
3. Goes and does it — using THEIR professional judgment, THEIR social credibility, THEIR reputation
4. Reports back: "I reached out to 7 property managers. Henderson PM was really interested — they want to talk. ABC asked for references. Here's the summary."

The advisor doesn't send you 7 draft emails to approve. They're a professional. That's the whole point. If they needed approval on every email, you'd just write the emails yourself.

**What Alex SHOULD do:**

- **Get consent to the approach**, not approval per action
- **Act autonomously** using professional judgment (Context 2, Insight-160 — already says autonomous)
- **Report back** on what was done and what happened
- **Quality gate protects reputation** — the gate is on Alex's professional standards, not on user pre-approval

### The Trust-Building Exception

In the early relationship (first 1-2 outreach cycles), Alex might show the user HOW they'll approach things — not seeking approval, but building confidence:

- "Here's the kind of email I'd send to a property manager" (an example, not a draft for approval)
- "Here's how I'd position your business" (the strategy, not each execution)
- Maybe a process map showing the outreach → follow-up → nurture cycle

This is **educational**, not **approval-seeking**. The user sees Alex's professionalism and gains confidence. After 1-2 cycles, this fades — the user trusts Alex and just gets the results.

### Bespoke Signed Review Pages

When Alex needs to show the user something richer than email can carry — a proposed approach, a set of targets with reasoning, a process map — email isn't enough. But a full workspace is premature.

**Solution:** Alex sends the user to a **bespoke signed page** on the Ditto network. This is:

- A lightweight authenticated page (magic-link signed, no password)
- Renders rich content: process proposals, target lists with reasoning, draft positioning strategies, approach examples
- Has Alex available on the page for conversation — the user can ask questions or make refinements
- Ephemeral — it exists for this specific review, not as a permanent surface
- NOT a workspace — no process management, no trust controls, no sidebar

**The flow:**
```
Alex (via email): "I've put together my approach for reaching property managers.
                   Take a look here: [signed link]"

User clicks → sees:
  - Alex's proposed approach (positioning strategy, target types, email style)
  - Example introduction (not asking for approval — showing competence)
  - Target shortlist with reasoning ("Henderson PM: 200+ properties, residential focus,
    recently expanded — strong fit")
  - Alex available to chat: "Any questions? Anything I should know about these companies?"

User: "Henderson PM — I actually know the owner. Maybe mention I was referred."
Alex: "Perfect. I'll mention the referral. Anything else?"
User: "Looks good. Go for it."
Alex: [proceeds autonomously]
```

This page is the middle ground between email and workspace. It provides the rich review surface that email can't, without the commitment of a full workspace.

### Architectural Implications

1. **`front-door-intake.yaml` needs redesign.** The `user-approval` human step should be replaced with a consent-and-refine step. Alex doesn't wait for per-intro approval — Alex gets consent to the approach, then executes.

2. **Bespoke signed pages are a new surface type.** They need:
   - Magic-link authentication (already built for workspace access)
   - Rich content rendering (ContentBlocks — already built)
   - Alex chat on the page (network-chat — already built)
   - Ephemeral lifecycle (created per review, archived after use)
   - Route: `/review/[signed-token]` on the network service

3. **Trust context enforcement.** This aligns perfectly with Insight-160 Context 2: Alex as professional starts autonomous. The quality-gate (critical tier, never bypassed) protects reputation. User never needs to approve individual outreach.

4. **The consent model changes from "approve each action" to "approve the approach."** This is more natural, more professional, and more scalable. One consent gates an entire outreach cycle, not each email within it.

## The Experience Difference

**Old model (assistant):**
```
Alex: "Here are 8 draft intros. Approve each one."
User: [reads 8 emails, approves 6, edits 1, rejects 1] — 20 minutes
Alex: "Sent. Here are the results."
```

**New model (professional):**
```
Alex: "I'll reach out to 7 property managers. I'll position you as a quality
       residential painter with heritage experience. Sound good?"
User: "Yep, go for it"
Alex: [reaches out using professional judgment]
Alex: "Done. Henderson PM was really interested — they want to talk.
       ABC asked for references. Two haven't responded yet — I'll
       follow up in 5 days."
```

The user's time: 30 seconds vs 20 minutes. Alex's credibility: professional advisor vs email secretary.

## Where It Should Land

- `front-door-intake.yaml` — redesign consent model
- New route/component: `/review/[token]` for bespoke signed pages
- architecture.md — bespoke review pages as a surface type
- network-chat integration for review pages
- Insight-160 — this reinforces Context 2 autonomy
