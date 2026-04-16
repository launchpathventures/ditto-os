# UX Research: Continuous Capability Awareness

**Date:** 2026-04-16
**Trigger:** Brief 166 — cold start problem + ongoing capability discovery
**Insight:** 193
**Human jobs served:** Orient (what could be happening), Define (what to set up next), Decide (which capability to activate)

---

## The Design Problem

Alex has 32 process templates. Users discover them by asking in chat or browsing a flat catalog. This creates two failures:

1. **Cold start failure:** New user creates one process, doesn't know what else exists. The other 5-6 capabilities that would transform their business sit undiscovered.
2. **Ongoing expansion failure:** Every conversation contains signals about unmet needs. User says "follow-ups are falling through the cracks" and Alex doesn't respond with "I can handle that — want me to set it up?"

The design question: **How should Alex surface capability awareness so it feels like a knowledgeable colleague thinking alongside the user — not a recommendation engine, not a sales pitch, not a notification system?**

---

## Persona Lens

Each persona experiences capability discovery differently:

### Rob (trades, phone-first, between jobs)
- **Discovery mode:** Won't browse a Library. Alex must bring suggestions TO him.
- **Tone:** Practical, brief. "I can also handle your follow-ups. Want me to set that up?" — not "Based on our analysis of your business needs..."
- **Trigger moments that matter:** Post-approval (he approves on phone, natural pause), morning brief (reads on way to site), after first process success (confidence moment).
- **Package size:** Max 2 at a time. He's standing on a roof. (Note: the matcher produces a universal ranked list; the onboarding package shows max 3 universally, but Rob will naturally focus on the top 1-2. Per-persona truncation is not required — the ranking handles relevance.)
- **Format:** One sentence + one action button. No paragraphs.

### Lisa (ecommerce, strategic, quality-obsessed)
- **Discovery mode:** Will explore Library if personalized. Responds to systems thinking.
- **Tone:** Strategic. "Here's what a fully-automated product pipeline looks like" — show the vision.
- **Trigger moments:** Post-onboarding (wants the full picture), when she mentions a new challenge (strategic signals), after she teaches a pattern (confidence in the system).
- **Package size:** Can handle 3-5 as a system view. Wants to see the whole landscape.
- **Format:** Visual — a capability map showing what's active, what's recommended, what's available.

### Jordan (org leverage, needs fast ROI, demos to leadership)
- **Discovery mode:** Evaluates capabilities by ROI. "These 4 processes together save X hours/week."
- **Tone:** Impact-oriented. "That's running. Here are 3 more I can stand up this week."
- **Trigger moments:** After first success (needs to show velocity), after trust upgrade (evidence of value), before leadership meetings (needs ammunition).
- **Package size:** Batch of 3-4 framed as a "quick wins" package.
- **Format:** Table or list with clear impact estimates.

### Nadia (team manager, quality across people)
- **Discovery mode:** Thinks about team patterns. "3 of your team members correct the same thing — one process fixes it for everyone."
- **Tone:** Team-oriented. Connected to cross-team patterns.
- **Trigger moments:** When correction patterns emerge across team members, when she reviews team output, morning brief with team health.
- **Package size:** 1-2, connected to specific team patterns she can see.
- **Format:** Evidence-based — show the pattern first, then the solution.
- **Team context note for Architect:** Nadia's recommendations should draw from team-wide correction patterns and process usage, not just her individual user model. The capability matcher needs a "team context" input for multi-user workspaces — query correction patterns across all team members' processes, surface capabilities that address cross-team pain. This is a Phase 12+ (Governance at Scale) concern but the matcher interface should accommodate it from day one (nullable `teamId` parameter).

---

## Design Principle: The EA Mental Model

A great EA doesn't have a "suggestions" feature. They have continuous awareness that manifests naturally:

- **While processing your inbox:** "By the way, I noticed three supplier invoices came in this week — want me to handle those going forward?"
- **After completing a task:** "That's done. While I'm at it, your competitor just changed their pricing. Want me to keep an eye on that?"
- **When you mention something new:** "You mentioned you're hiring. I can handle reference checking if you want."
- **At the start of the day:** "Morning. Quoting is running smoothly — you haven't had to correct anything in two weeks. Meanwhile, I noticed follow-ups are falling through. Want me to set that up?"

The pattern: **observe → connect → offer** — not **analyze → recommend → present**.

---

## Seven Trigger Moments: Interaction Design

### 1. Post-Onboarding Capability Package

**When:** After user's first process is created and running (onboarding step 5 complete).

**What the user sees:**

Alex says something like:
> "Your quoting process is running — you'll see the first output in a few minutes.
>
> Based on what you've told me about your plumbing business, here's what else I'd set up:"

Then a **CapabilityPackageBlock** (new content block type) renders:

```
+----------------------------------------------------+
| What I'd set up for your business                   |
|                                                     |
| [active] Quoting            Running now             |
| [recommended] Follow-ups    "follow-ups fall through"|
| [recommended] Job scheduling "never at a desk"       |
| [available] Supplier mgmt   Common for trades        |
|                                                     |
| [ Set up follow-ups ]  [ Show me all capabilities ] |
+----------------------------------------------------+
```

**Design rules:**
- Max 3 recommended (matched to user context). Remainder available but de-emphasized.
- Each recommendation shows the user's OWN words as the match reason (from user model).
- One primary action ("Set up [top match]"), one secondary ("Show me all capabilities" → Library).
- Block appears ONCE, inline in conversation. Not repeated.
- If user dismisses or ignores, Alex doesn't bring it up again for 30 days (same cooldown as all other suggestion surfaces — one policy for the Architect to implement).

**Persona test:**
- Rob: sees 2 recommendations on phone, taps "Set up follow-ups" between jobs. Done.
- Lisa: sees 3-4 recommendations, taps "Show me all capabilities" to see the full picture.
- Jordan: sees impact framing ("saves ~2 hours/week"), picks the one with highest ROI.
- Nadia: sees team-connected recommendations ("your team corrects formatting 40% of the time").

---

### 2. Post-Approval Contextual Nudge

**When:** User approves a review item. The approval creates a natural conversational pause.

**What the user sees:**

Alex confirms the approval, then — ONLY if a relevant unactivated capability connects to the approved output — adds a one-line nudge:

> "Approved and sent. One thing — you mentioned follow-ups falling through the cracks. I can handle that automatically. Want me to set it up?"

**Design rules:**
- One sentence max. No block, no card — just text in conversation.
- Only fires if there's a genuine contextual connection (not random suggestion).
- Max once per session (not after every approval).
- If user says "not now" or ignores, Alex doesn't repeat for 30 days.
- Tone: casual observation, not recommendation. "One thing —" or "By the way —" or "While I have you —"

**Persona test:**
- Rob: "Approved. While I have you — I can also chase up your overdue invoices automatically." One tap to say yes.
- Lisa: "Approved. I noticed you corrected the brand voice again — want me to learn that pattern so it doesn't happen next time?" (this is MP-4 "teach this", not capability awareness — don't conflate).
- Jordan: "Approved. That's 5 clean runs in a row — at this rate, you won't need to review these much longer." (trust nudge, not capability push).

**Anti-pattern:** Don't suggest a new capability when the user just spent cognitive effort reviewing something. The nudge must feel like a natural extension, not a pitch. If no genuine connection exists, stay silent.

---

### 3. Session-Start Briefing Integration

**When:** User returns (new session). Self already delivers a briefing.

**Current state:** Briefing has 5 dimensions (focus, attention, upcoming, risk, suggestions). Suggestions are 1-2 items appended at the end.

**Proposed change:** Don't bolt suggestions onto the end. Weave capability awareness INTO the narrative at the natural moment:

> "Morning. Your quoting process handled 3 quotes overnight — all approved automatically. Follow-up sequences sent 2 reminders, one reply came back positive.
>
> **One gap I'm noticing:** you don't have anything running for new customer acquisition. Other plumbing businesses find outreach useful — I could draft personalised messages to builders in your area. Want me to set that up, or is that something you handle yourself?"

**Design rules:**
- Capability suggestion woven into the briefing narrative, not a separate "Suggestions" section.
- Framed as an observation about a gap, not a recommendation from a list.
- Includes opt-out language: "...or is that something you handle yourself?" — gives user permission to decline without friction.
- One capability suggestion per briefing max. Not two. The briefing is about Orient, not Decide.
- For established users (5+ active processes): skip capability suggestions in briefing entirely. They're past the expansion phase.

**Persona test:**
- Rob: Reads briefing on phone at 7am. Sees the gap observation naturally. Taps "set it up" or ignores it. Either way, it's one line in a 3-paragraph brief.
- Nadia: Briefing mentions team patterns → "Your team corrected citation formatting 8 times this week. A formatting process would catch these before they reach you."

---

### 4. Trust Upgrade Expansion Moment

**When:** TrustMilestoneBlock surfaces (process graduated to higher trust tier).

**What the user sees:**

The existing celebration (MP-5.1) already has emotional weight. Extend it with one line:

> "Your quoting process has been 95% accurate over 25 runs. I'd like to check in less often. [Accept / Keep reviewing]
>
> Now that quoting runs itself, I have capacity to take on something else for you. Your follow-ups could use the same treatment."

**Design rules:**
- The expansion suggestion is BELOW the trust milestone — don't steal the celebration moment.
- One line, one capability. Connected to the process that just graduated ("the same treatment").
- Only suggests capabilities in the same business area (quoting graduated → suggest invoicing or follow-ups, not hiring).
- If no relevant capability exists, just celebrate. Don't force a suggestion.

---

### 5. New Context Learned

**When:** `update_user_model` is called and a new dimension is populated or updated that matches an unactivated capability.

**What the user sees:**

Alex responds to whatever the user said, THEN naturally connects:

> User: "We're hiring two new plumbers next month."
> Alex: "Got it — I'll keep that in mind. By the way, I can handle reference checking for you. Want me to set that up when you're ready?"

**Design rules:**
- Alex responds to the user's actual message FIRST. The capability connection is secondary.
- Only fires for strong matches (user mentions a topic that directly maps to a template).
- Phrased as "I can" not "you should." Offering capability, not prescribing action.
- "When you're ready" gives temporal flexibility — user might not need it yet.
- Max once per conversation (if user mentions 3 new things, pick the strongest match).

---

### 6. Library Personalization

**When:** User navigates to Capabilities view.

**Current state:** Flat list of templates by category.

**Proposed redesign:**

```
+----------------------------------------------------+
| Capabilities                                        |
|                                                     |
| RECOMMENDED FOR YOUR BUSINESS                       |
| __________________________________________________ |
| Follow-up Sequences                                 |
| "You mentioned follow-ups falling through"          |
| [ Set this up ]                                     |
| __________________________________________________ |
| Job Scheduling                                      |
| "You said you're never at a desk"                   |
| [ Set this up ]                                     |
| __________________________________________________ |
|                                                     |
| ACTIVE (3)                                          |
| [running] Quoting           Autonomous              |
| [running] Outreach Cycle    Supervised               |
| [running] Daily Briefing    Autonomous              |
|                                                     |
| ALL CAPABILITIES                                    |
| Growth & Marketing (2)                              |
|   GTM Pipeline              Available               |
|   Content Calendar          Available               |
| Operations (4)                                      |
|   Invoicing                 Available               |
|   Supplier Management       Available               |
|   ...                                               |
+----------------------------------------------------+
```

**Design rules:**
- "Recommended" section at top (max 3), showing user's own words as match reason.
- "Active" section shows what's already running with trust tier indicator.
- "All capabilities" is the full catalog, grouped by category.
- Each capability has a "Set this up" action that opens conversation with Alex.
- Recommended section disappears when user has 5+ active processes (no longer expanding).
- If no user model exists yet (brand new user), show "Tell Alex about your business to get personalised recommendations" instead of recommended section.

**For the empty state** (no user model, no processes):
> "Here's everything Alex can do. Tell him about your business and he'll recommend where to start."
> [Tell Alex about my business]

Then show the full catalog below, ungrouped by relevance (since we have no context to rank).

---

### 7. Today View: Recommended Section

**When:** User views Today composition.

**Current state:** Shows active work, pending reviews, briefing narrative.

**Proposed addition:** Between active work and the briefing content, a compact "Recommended" strip:

```
+----------------------------------------------------+
| Today                                               |
|                                                     |
| NEEDS YOUR ATTENTION (2)                            |
| [review] Outreach draft — 3 messages ready          |
| [review] Quote #847 — $4,200 kitchen renovation     |
|                                                     |
| RECOMMENDED                                         |
| Follow-up Sequences — "follow-ups fall through"     |
| [ Set this up ]                                     |
|                                                     |
| RUNNING SMOOTHLY                                    |
| Quoting — 3 approved overnight                      |
| Daily Briefing — delivered at 7am                   |
+----------------------------------------------------+
```

**Design rules:**
- Max 1 recommended capability (this is Orient, not Define — keep it focused).
- Shows user's own words as match reason.
- Compact: one line + one action. Not a card, not a block — a line item.
- Hidden when: (a) user has 5+ active processes, (b) no matched capabilities, (c) user dismissed this specific suggestion.
- Position: between attention items and running-smoothly items. The natural reading flow: "What needs me → What I'm missing → What's fine."

---

## Intensity Curve: Suggestions Over Time

The biggest design risk is: too aggressive early → user feels sold to, or too subtle always → user never discovers capabilities.

| Phase | Intensity | What user sees |
|-------|-----------|---------------|
| **Day 1 (onboarding)** | HIGH | Capability package (3-5 matched). "Here's what I'd set up for your business." One block, one moment. |
| **Week 1** | MEDIUM | Briefing includes 1 gap observation. Library shows recommendations. Post-approval nudge once. |
| **Week 2-3** | MEDIUM | Trust upgrade expansion. New-context-learned connections. Library still personalised. |
| **Month 1** | LOW | One suggestion per briefing (only if genuine gap). Library personalised but not pushy. |
| **Month 2+** | MINIMAL | Only on strong signals (new context learned, trust upgrade). Library shows "all capabilities" without recommended section. Suggestions effectively stop — user has built their process portfolio. |

**The principle:** Suggestion intensity should inversely correlate with process portfolio size. More processes active = fewer suggestions. The system is doing its job when it stops suggesting.

---

## Content Block: CapabilityPackageBlock

New content block type for the post-onboarding moment (trigger #1):

```typescript
type CapabilityPackageBlock = {
  type: "capability_package";
  title: string;                    // "What I'd set up for your business"
  capabilities: Array<{
    slug: string;
    name: string;
    status: "active" | "recommended" | "available";
    matchReason?: string;           // User's own words
    // Note: relevanceScore drives sort order in the composition layer,
    // NOT passed to the renderer. The block receives pre-sorted capabilities.
  }>;
  actions: Array<{
    id: string;
    label: string;                  // "Set up follow-ups"
    style: "primary" | "secondary";
    payload: { action: string; slug: string };
  }>;
};
```

**Block count note:** The content block discriminated union currently has 26 types (not 22 as stated in some docs — WorkItemFormBlock, ConnectionSetupBlock, SendingIdentityChoiceBlock, TrustMilestoneBlock were added since the original count). This would be #27. The Architect should evaluate whether existing blocks (RecordBlock + ActionBlock) can compose this, or whether the `active/recommended/available` tristate rendering justifies a dedicated type.

**Rendering:** Active items show green dot. Recommended items show blue dot + match reason in small text. Available items show grey, collapsed by default. Primary action starts conversation with Alex about the top recommendation.

**Text fallback (for non-UI surfaces):**
```
What I'd set up for your business:
* [running] Quoting — Running now
* [recommended] Follow-ups — "follow-ups fall through"
* [recommended] Job scheduling — "never at a desk"
* [available] Supplier management — Common for trades

Reply "set up follow-ups" to get started.
```

---

## Interaction States

| State | What happens |
|-------|-------------|
| **No user model** | Library shows full catalog without recommendations. Today shows no recommended section. Onboarding drives the first interaction. |
| **User model, no processes** | Capability package in onboarding conversation. Library shows recommendations. Today empty state with recommendations. |
| **1-2 processes active** | Full recommendation experience: briefing suggestions, post-approval nudges, library personalised, Today recommended section. |
| **3-4 processes active** | Briefing suggestions continue. Post-approval nudges taper (once per week max). Library still personalised. |
| **5+ processes active** | Recommendations stop in briefing and Today. Library shows "Active" section prominently, all capabilities available below. Only strong signals trigger suggestions (new context learned, trust upgrade). |
| **Suggestion dismissed** | 30-day cooldown on that specific suggestion. Others still surface. If ALL recommendations dismissed, recommended sections hidden until new matches emerge. |
| **Processes paused (user-initiated)** | Paused processes still count toward portfolio size. Suggestions continue normally — a user who paused one process might need a different one. Don't suggest reactivating paused processes (that's Orient, not Decide). |
| **Review-overloaded (Insight-142)** | If user has 2+ processes at supervised tier (heavy review load), suppress new capability suggestions. Wait until at least one reaches spot-checked. The user is overwhelmed with reviews — adding more work is counterproductive. |
| **During exceptions** | Zero suggestions anywhere. All capability awareness suppressed until exceptions resolved. |
| **Loading** | Skeleton placeholders for recommended section in Library and Today. Briefing renders without suggestion dimension. |
| **Error (capability matching fails)** | Graceful degradation: Library shows flat catalog without recommendations. Today omits recommended section. No error shown to user. |

---

## Anti-Patterns to Avoid

1. **The recommendation wall.** Never show more than 3 capabilities at once (onboarding package) or 1 in ongoing surfaces. Overwhelm kills discovery.

2. **The sales pitch.** "Based on our analysis of businesses like yours, we recommend..." — NO. "I noticed you mentioned follow-ups. I can handle that." — YES.

3. **The notification.** Don't badge the Library with a number. Don't push notifications about new capabilities. Don't use AlertBlocks for suggestions. Suggestions are observations, not alerts.

4. **The cold recommendation.** Never suggest something unconnected to the user's context. "Other businesses use invoicing" is weak. "You mentioned chasing payments — I can invoice automatically" is strong. If no strong match exists, stay silent.

5. **The repeat.** User ignored a suggestion → don't bring it up again for 30 days. User explicitly said "no" → don't bring it up again unless their context changes materially.

6. **The interruption.** Post-approval nudge must never feel like it's stepping on the completion moment. The approval confirmation comes first. The nudge is a P.S., not the message.

7. **Conflating suggestion types.** Capability awareness ("set up follow-ups") is different from trust suggestions ("let this run more autonomously") is different from learning signals ("want me to remember this correction?"). Each has its own moment. Don't combine them into a "suggestions" bucket.

8. **The capacity-blind suggestion (Insight-142).** If the user has 2+ processes at supervised tier, they're spending significant time reviewing. Don't suggest adding a 4th process until at least one graduates to spot-checked. The system should expand the user's portfolio only when they have bandwidth to absorb it.

---

## Process Architecture Notes (for the Architect)

The capability matcher should be a **deterministic function** (no LLM in the hot path):
- Input: user model entries + active process slugs + template metadata
- Output: ranked list of (templateSlug, relevanceScore, matchReason)
- Matching strategy: token overlap between user model content and template descriptions/quality_criteria, weighted by dimension (problems > challenges > tasks > vision)

Trigger moments should be **signals injected into Self context**, not separate tool calls:
- The Self already has `<briefing_signal>` and `<first_session_signal>` patterns
- Add `<capability_signal>` for the same pattern: contextual information that the Self weaves into conversation naturally, using its own judgment about timing and tone
- This preserves the EA mental model: Alex decides when to mention capabilities, the system just ensures Alex knows about the gap

The CapabilityPackageBlock is a **one-time** content block emitted during onboarding, not a persistent UI element. It appears in the conversation feed and scrolls away like any other message.

Library personalization is a **server-side sort** — the composition function receives scored capabilities and renders them in order. No client-side intelligence needed.

---

## Reference Patterns from Other Products

| Product | Pattern | What transfers | What doesn't |
|---------|---------|---------------|--------------|
| **Notion AI** | Suggests templates when creating new page | Context-sensitive template matching | Notion's is creation-time only, not ongoing |
| **Linear** | Inbox suggestions ("You might want to...") | Inline, natural-moment suggestions | Linear's are task-management, not capability expansion |
| **Superhuman** | Personalized shortcuts based on usage | Learning what matters to THIS user | Superhuman's is productivity tips, not new capabilities |
| **Spotify Discover** | "Made for you" mixed into every surface | Personalized recommendations everywhere | Spotify pushes discovery aggressively — Ditto should be subtler |
| **Apple Health** | Summary shows what you track + nudges for what you don't | Gentle gap awareness | Apple is passive; Ditto's Alex should be active |
| **Slack Workflows** | Suggests workflows when patterns detected | Pattern-to-automation suggestion | Slack's is bottom-up (detected patterns); Ditto's is top-down (known templates) + bottom-up (work item clustering) |

**The closest analogy is a great executive assistant** — not any software product. The EA knows your calendar, your priorities, your business, AND what services exist that you're not using. They mention it at the right moment. That's the bar.

**Provenance notes:**
- 30-day cooldown: existing Ditto pattern (Brief 110, suggestion_dismissals table). Retained for consistency.
- Intensity curve (HIGH→MINIMAL over 8 weeks): Original to Ditto. Calibrated to the emotional journey in personas.md.
- User's own words as match reason: Original to Ditto. Derived from Insight-049 (consultative, not configurative) and Insight-073 (user language, not system language).
- CapabilityPackageBlock: Original to Ditto. Closest existing pattern is ProcessProposalBlock (interactive, action buttons, structured data) — extended with tristate status rendering.
- Capacity-blind suppression (Insight-142): Original to Ditto. No external reference product does this — they all suggest regardless of user load.

---

## Open Questions for the Architect

1. **Should the CapabilityPackageBlock be a new content block type, or can it be composed from existing blocks (RecordBlock + ActionBlock)?** The existing block types might suffice — but the "active / recommended / available" state is new.

2. **How should the capability matcher handle multi-tenant (Nadia's team)?** Nadia's recommendations should connect to team-wide patterns, not just her individual user model. Does the matcher need a "team context" input?

3. **Should trigger signals be part of `assembleSelfContext()` or part of `assembleBriefing()`?** The briefing already has a suggestions dimension. Other triggers (post-approval, post-trust-upgrade) would need to be in Self context assembly, which runs on every conversation turn.

4. **Token budget impact.** The `<capability_awareness>` section at ~200-300 tokens is always-loaded. Self context budget is 9000 chars (~2250 tokens). Is there room? What gets dropped if the budget is tight?
