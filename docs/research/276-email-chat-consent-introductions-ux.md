# Brief 276 — Email, Chat, Consent & Introduction Facilitation: UX Research + Interaction Spec

**Date:** 2026-05-19
**Status:** draft (Designer output; review pending)
**Brief:** `docs/briefs/276-email-chat-consent-introductions.md`
**Role:** Dev Designer
**Persisted to:** `docs/research/276-email-chat-consent-introductions-ux.md`
**Consumer:** Dev Architect (synthesises with Researcher findings into the brief's User Experience section)

---

## 1. Why This Spec Exists

Brief 276 is the **act** step of the Network Agent. Briefs 273–275 let Ditto define Active Requests, search, score Possible Connections, watch quietly, and propose. Brief 276 owns the moment Ditto stops thinking and starts **communicating with people about a real introduction**. It is the highest-trust-stakes surface in the Network product so far, because every other Network capability rests on the user believing two things:

1. *Ditto will never contact someone on my behalf without my consent.*
2. *Ditto will never let someone be contacted about me without their consent.*

A single bad email — sent prematurely, written impersonatingly, or leaking private context — destroys all the watch/search/proposal work upstream. The interaction design must reflect that the email surface is **load-bearing trust infrastructure**, not a marketing channel.

The brief inherits the AuthorizationRequestBlock from Brief 248/261, the representative-not-impersonator posture from Brief 259, the four refusal triggers from Brief 261, and the channel-aware delivery from Briefs 098b/099a-c. The UX work here is mostly **orchestration of existing primitives** plus four new surfaces: an intro-proposal-card in chat, four new email types, the post-intro follow-up loop, and the natural-reply-as-feedback path.

---

## 2. Persona Lens — Four Tests

Every interaction in this spec must answer these four questions truthfully. If it cannot, it does not ship.

### 2.1 Rob (Trades MD, on jobsite, mobile-first)

> *Rob is in his truck between two roofing callouts. His phone buzzes. Subject: "Mira found a commercial-property manager who matches your need for repeat clients." Five seconds of reading time. Three options. He taps **Open chat** to skim the why, taps **Ask if open**, drives off.*

**Litmus tests:**

- Decision email must be readable in **under 5 seconds on a phone in sunlight**. One clear reason, three clear actions, no scrollable wall of context.
- Approve action must be **one tap** — no extra form, no calendar picker, no follow-up "are you sure".
- "Open chat" must lead to a chat surface that loads under 2s on LTE and shows the full proposal context inline.
- If Rob doesn't reply, the system must **not nag him**. One reminder max, then silent close.

### 2.2 Lisa (Ecommerce MD, evaluative, asks questions)

> *Lisa receives the recipient approval email. "Tara is looking for someone who's grown a DTC brand past £10M ARR. Want to be introduced?" She doesn't accept immediately. She replies: "What does she actually want — advice or a job?" Ditto must treat this as feedback and refinement, not as rejection.*

**Litmus tests:**

- A free-text reply that contains a question must route to chat with the question and Ditto's answer attached, **not** mark the decision as declined.
- Chat must surface "you asked X — here's what we know" without re-asking Lisa to repeat herself.
- Decline reason taxonomy must capture nuance: "too junior", "wrong domain", "salesy", "already know them", "not now" — not just "yes/no".

### 2.3 Jordan (Generalist technologist, evaluator/early adopter, wants to demo it)

> *Jordan wants to see the consent state machine. He approves a recipient request, then opens the **Introductions** drawer in his workspace to watch the state transition from `recipient-asked` to `recipient-approved` to `thread-sent`. He wants to point at a screen and say "look, both consents are stored, the thread didn't go out until both said yes."*

**Litmus tests:**

- Every consent state must be **visible and inspectable** in a non-technical way — not just present in the database.
- The state log must read as a coherent narrative ("you asked; she received; she approved; thread sent at 14:02") not as a row dump.
- Approved and "what was shared" must be inspectable post-hoc — Jordan must be able to see exactly what the recipient saw.

### 2.4 Nadia (Team manager, oversees others)

> *Nadia manages a team of advisors. She wants visibility into outstanding intro requests across her team without seeing the contents. Did anyone get a recipient-approval email that's been sitting for 5 days? Did the warm intro thread go out?*

**Litmus tests:**

- States that are **stuck** must surface as a status, not buried in email history.
- Aggregate counts of pending/declined/successful intros must be derivable without reading every individual record (this is more a Brief 278/observability concern, but the UX spec must not make it impossible).

---

## 3. Six Human Jobs Mapping

| Job | How Brief 276 serves it | Primary surface |
|-----|------------------------|----------------|
| **Decide** ⭐ primary | Two-sided consent gates — every send/thread is a discrete approve/decline/refine decision | Decision email + chat AuthorizationRequestBlock |
| **Review** | Inspect proposal rationale, evidence, what's about to be shared with the other side, prior intro outcomes | Chat panel with `IntroProposalCard` + intro history drawer |
| **Capture** | Natural-language reply as feedback ("too junior, more commercial"); decline reason taxonomy; follow-up outcome answers | Email reply ingestion + follow-up email + chat |
| **Orient** | Status of any in-flight intro — what state, who's waiting on whom, when next reminder | Introductions drawer / state log inside chat |
| **Delegate** | Setting frequency, timing, "don't reach out to this person again", "always ask me by chat not email" | Settings inside chat + per-proposal "edit before send" |
| **Curate** (emerging — Insight-238) | Decline taxonomy + outcome feedback shapes which proposals appear next time | Decline reasons + post-intro follow-up |

**Decide is doing the heavy lifting.** The brief's UX value is *not* in flashy proposal rendering — it's in making approve/decline/refine a frictionless one-tap action that captures enough nuance to teach Ditto, on either side, from either channel (email or chat), without sending anything before both sides explicitly agree.

---

## 4. Primitives Used & How They Compose

No new primitives are needed. Brief 276 is an **orchestration of existing pieces** plus four new templates and one new chat component.

| Primitive | Source | Role in Brief 276 |
|-----------|--------|-------------------|
| `AuthorizationRequestBlock` | Brief 248 + 261 (`packages/core/src/content-blocks.ts:286-312`) | Consent surface in chat for both requester (Q1) and recipient (Q2). `costLabel` reused from 261 to indicate "1st of 2 free intros" etc. `actionClass: "email-send"` for both gates. `executionResult` updates when state transitions. |
| `notifyUser` + channel adapters | Briefs 098b/099a-c (`src/engine/notify-user.ts`, `src/engine/channel.ts`) | All four email types route through this path. Adds throttle/suppression. **No parallel email path.** |
| Magic link + chat session | Brief 259 (`src/engine/magic-link.ts` 24h, `packages/web/app/chat/page.tsx`) | "Open chat" link in every decision email; chat opens with full proposal context loaded |
| Inbound email reply routing | Brief 282 (`src/engine/inbound-email.ts`) | Replies on intro approval / follow-up threads route to structured feedback + chat refinement |
| ContentBlocks renderer | `packages/web/components/blocks/*` | All proposal/approval/intro surfaces are ContentBlocks — render the same way in chat and in workspace |
| Cross-deployment delivery (Network → workspace) | Brief 259 (Insight-234) | Durable outbox + pull-and-ack for any artifact the recipient receives in their workspace |
| Email compliance gate | Brief 278/283 (`network-email-compliance.ts`, `network-suppression.ts`) | Every send (approval, intro, follow-up) passes through compliance before AgentMail handoff |

**New surfaces:**

1. `IntroProposalCard` — chat ContentBlock rendering one Possible Connection in full review form (rationale + evidence + private/public boundary + draft preview). Currently `PossibleConnectionCard` exists for save/refine; this is the **send-ready** sibling.
2. Four email templates — currently emails are composed in code (`formatEmailBody()`). Brief 276 introduces a stable template directory so the four intro-related email shapes are inspectable and editable.
3. `IntroStateLog` — a chat-rendered or drawer-rendered timeline of every consent transition for an intro.
4. Post-intro follow-up classifier — extends `classifyReply` to bucket follow-up replies into the outcome taxonomy.

---

## 5. The Process-Owner's Mental Model

A non-technical user (Rob, Lisa) should be able to draw the intro process on a napkin:

> *Ditto finds someone. → Ditto asks me first. → I say yes. → Ditto asks them. → They say yes. → Ditto introduces us via email. → Later, Ditto asks both of us how it went.*

That napkin is the spec. Everything in the implementation must lay over that mental model without distortion.

### 5.1 The Consent State Machine — Process-Owner View

The brief lists 7 technical states. The user sees 5 phases:

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  1. Considering │ → │  2. Your Turn   │ → │  3. Their Turn  │ → │ 4. Introduced   │ → │  5. Learning    │
│                 │   │                 │   │                 │   │                 │   │                 │
│  Ditto is       │   │  Mira asked     │   │  Mira asked     │   │  Email thread   │   │  How did it go? │
│  looking;       │   │  you. Awaiting  │   │  Tara.          │   │  sent to both   │   │  Was it useful? │
│  nothing sent.  │   │  your decision. │   │  Awaiting hers. │   │  parties.       │   │  Outcome?       │
└─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘
                              │                     │                                              │
                              ▼                     ▼                                              ▼
                          decline /             decline /                                    follow-up
                          not-now /             not-now /                                    captured
                          refine                refine
```

**Why this matters for UX:** the technical state names (`recipient-asked`, `recipient-approved`) are accurate but lifeless. User-facing copy uses plain language tied to the phase: "Waiting for you", "Waiting for them", "Sent". The technical states stay in the audit log and the inspectable state machine that Jordan demos.

### 5.2 Where Decisions Happen

| Phase | Decision surfaces | Modes |
|-------|---------------|-------|
| 1. Considering | None — quiet | (system internal) |
| 2. Your Turn (requester) | Email + chat AuthorizationRequestBlock | Approve / Decline / Refine / Open chat |
| 3. Their Turn (recipient) | Email + chat AuthorizationRequestBlock (in their workspace, cross-deployment delivery) | Approve / Decline / Not now / More context |
| 4. Introduced | None blocking — informational email + chat update | (no decision required) |
| 5. Learning | Email follow-up + chat | Free text / structured outcome / "more like this" |

**Critical: every decision is reversible upward and learns downward.** A "Decline" captures a reason; a "Refine" routes to chat for editing; a "Not now" sets a timer; a follow-up "useful conversation" propagates to future watch behavior.

---

## 6. Decision Email Anatomy — Four Templates

### 6.1 Email Type 1: Requester Approval ("Your turn")

**Trigger:** Possible Connection or Watch Proposal passes network health and reaches the requester.

**Sender identity:** Mira <mira@${userHandle}.ditto.partners> (workspace-side persona, established by Brief 280 IA).

**Subject pattern:** `Mira may have found a fit: [target name/headline]`

> Example: "Mira may have found a fit: Tara Chen, Director of Operations at Acme DTC"

**First line (above the fold on mobile):**
> *Mira found someone who may fit your request for a commercial-property manager. She hasn't reached out — that's your call.*

**Context (2-4 bullets max):**
- **Why this person:** one sentence pulling from `whyThisFits` on the Possible Connection.
- **Why now:** optional, if `whyNow` is populated (timing/evidence change).
- **Source:** "From your network — introduced via Sam Patel last year" / "From a public mention in TechCrunch dated…"
- **Cost:** "1st of 2 free intros this month" (from `costLabel`, Brief 261) — only if the user is on free tier.

**Primary action (one button, full-width on mobile):**
> **Ask if she's open** → mints requester-approval, triggers recipient-ask flow

**Secondary actions (text links):**
- **Open chat for full details** → magic link → chat with `IntroProposalCard` rendered
- **Not this person** → mints decline with reason capture
- **Refine first** → routes to chat with "edit/refine" mode
- Or: *reply naturally — "too junior, more commercial" etc. is captured as feedback*

**Footer:**
- Persona sign-off (existing `formatEmailBody`)
- Opt-out link (existing)
- RFC 8058 List-Unsubscribe headers (Brief 283)

**Interaction states:**

| State | Render |
|-------|--------|
| Pending (sent, no action yet) | Default email content + chat shows yellow "awaiting your decision" banner |
| Approved | Chat updates to "Asking Tara now" + email confirmation thread continues |
| Declined | Chat captures reason in `IntroStateLog`; future watches learn |
| Refined | Routes to chat; original email becomes informational |
| Expired (no response after N days) | One reminder at +3 days; then quiet close with "we paused this — let us know if you want to resume" |
| Suppressed (compliance check failed) | Falls back to chat-only; the user sees the proposal in chat but no email goes out; admin audit row |

### 6.2 Email Type 2: Recipient Approval ("Their turn")

This is the most sensitive email Ditto sends. It is the moment a non-member-of-this-conversation gets contacted on behalf of a member.

**Trigger:** Requester approves Q1 above. Recipient must be a Ditto member OR a discovered person with a claim path (Brief 279). Non-members go through the Brief 279 invite path first.

**Sender identity:** **Critical — the email must come from the requester's persona-and-workspace, not the recipient's.** Tara receives an email from `mira@launchpath.ditto.partners` (the requester's persona), not from her own. The "from" makes clear that **someone is asking, not Ditto-the-platform broadcasting**.

**Subject pattern:** `[Requester first name] is hoping for an intro — would you be open?`

> Example: "Tim is hoping for an intro — would you be open?"

**First line:**
> *Tim Galland is looking for a commercial-property manager who's repeatable. He thinks you might be a fit. He's asked Mira (his Ditto) to check with you first — nothing is shared with you, and your details aren't shared with him until you both say yes.*

**Context (2-4 bullets — APPROVED CONTEXT ONLY):**
- **What he's looking for:** one sentence from approved Active Request (private notes scrubbed).
- **Why you:** one sentence rationale (no on-request or hidden claims unless explicitly approved).
- **About Tim:** one line — name, headline, public links. Nothing private. (See Hard Rule #6: no leakage.)

**Primary action:**
> **Yes, introduce us** → mints recipient-approval, triggers warm-intro-thread step

**Secondary actions:**
- **Not relevant** / **Not now** / **More context** — each captures a structured reason
- **Open chat to read more** → magic link to recipient's workspace, with proposal context shown
- *Reply naturally for free-text questions or feedback*

**Footer:**
- "You are getting this because Tim's Ditto thinks you might be a fit. You can decline; you can also tell Mira not to ask again." (Plain-language opt-out preceded by why-you-got-this.)
- RFC 8058 List-Unsubscribe + complaint webhook (Brief 283)

**Hard interaction rules:**

- **NEVER send if the recipient is on the requester's known block list** (Brief 261 AC-J3).
- **NEVER include private/on-request/hidden claims** unless the requester explicitly toggled "share this" during Q1 chat refinement.
- **NEVER send while the recipient is unclaimed Discovery Profile state** (Brief 279/284).
- **NEVER auto-send if compliance gate fails** (Brief 283). Falls back to operator review.

**Interaction states:** same five (Pending/Approved/Declined/More-context/Expired) with one addition: **Suppressed by compliance** routes to operator review queue (Brief 278).

### 6.3 Email Type 3: Warm Intro Thread

**Trigger:** Both sides approved. `create_intro_thread(stepRunId, introId)` is called by the approval route's wrapper run.

**Critical rules:**

- This is the **first time both parties are on the same email**.
- The email must read as if Ditto/Mira **wrote it on behalf of the requester** (representative posture) — NOT impersonating Tim. Hard Rule from Brief 259.
- Both parties must be on `to:` (or `to:` + `cc:` depending on convention). Tim is not bcc'd.
- The thread is hosted on AgentMail/Gmail and **Ditto is in the loop** for replies (so post-intro follow-up has data) — Insight from Brief 282.

**Sender identity:** Mira from Tim's workspace persona (same domain as the recipient-approval email).

**Subject:** `Intro: Tim Galland ↔ Tara Chen`

**Body skeleton:**

> Hi Tim and Tara,
>
> A quick warm intro. Tim, meet Tara Chen — Director of Operations at Acme DTC. Tara, meet Tim Galland, MD of Galland Trades.
>
> **Why I'm connecting you both:** Tim is looking for [approved context]. Tara, you mentioned [approved context].
>
> **Suggested next step:** [from `nextAction` on the Possible Connection — e.g., "a 20-minute chat about whether Tara's repeatable-client framework is a fit for Tim's roofing business"]
>
> Tim, Tara — happy to fade out of this thread. Looking forward to hearing how it goes.
>
> — Mira (Tim's Ditto)

**Footer:**
- Brief explanation: "Mira is Tim's Ditto. I help Tim with introductions. I'll check back with both of you in a couple of weeks to see how it went."
- Reply instructions: "Just reply to this thread; I'll get out of the way."
- Persona disclosure: small "what is Ditto" link.

**No opt-out footer on this email.** This is not a marketing email; it is a 1:1 introduction. (Brief 283 compliance must distinguish 1:1 intros from broadcast — confirm with compliance gate.)

**Interaction states (post-send, observed by both sides in workspace):**

| State | Render |
|-------|--------|
| Thread sent | Both parties' chats show "Tim ↔ Tara intro sent" + thread link |
| First reply (either party) | Chat shows the reply inline; outcome tracking starts |
| Silent thread (no reply in 14 days) | Follow-up triggers automatically; chat shows "No replies yet — checking in with both sides" |
| Conversation continuing | Chat aggregates basic activity (count of messages, last activity time) without rendering contents in either side's workspace unless explicitly fetched |

### 6.4 Email Type 4: Post-Intro Follow-up

**Trigger:** N days after `thread-sent`. Default: 14 days. User-configurable.

**Sent separately to each side.** Not a thread. Each party gets their own follow-up.

**Sender identity:** Same persona as the warm intro (Mira from Tim's workspace persona to both — even Tara, because the introduction was made representing Tim).

**Subject:** `How did the intro with [other party] go?`

> Example to Tim: "How did the intro with Tara go?"
> Example to Tara: "How did Tim's intro work out?"

**First line:**
> *Hi Tim — checking in. How did your conversation with Tara go?*

**Body — one structured question + free-text invitation:**

> **Was it useful?**
>
> - Yes, valuable conversation
> - We're still figuring out
> - Wasn't a fit
> - We didn't connect
>
> **What happened?** (optional)
> - Meeting booked
> - Hired / engaged
> - Funding / advisory / partnership
> - Collaboration started
> - Other
>
> *Or just reply with a sentence — anything is helpful for finding better matches next time.*

**Critical: the outcome taxonomy is the seed of future Brief 270 economic-outcome pricing.** The follow-up captures whether the introduction produced **professional/economic value**, not just whether the email was delivered. Per AC 11a, the taxonomy distinguishes:

- No reply / never met
- Useful conversation, no further outcome
- Meeting booked
- Work / client / hire / funding / advisory / partnership / collaboration outcome
- Willingness-to-pay signal where voluntarily offered ("happy to pay for more like this", "would have paid for this intro")

**Interaction states:**

| State | Render |
|-------|--------|
| Sent | Chat shows "Following up with Tim/Tara about the intro" |
| Replied (structured) | Outcome captured; Member Signal / Active Request preferences updated; future watches learn |
| Replied (free-text only) | Parsed into category via `classifyReply` extension; ambiguous routes to chat with proposed interpretation |
| No reply after 7 days | One reminder; then archive as "outcome unknown" |
| Opt-out signal in reply | Recorded; future follow-ups for this user suppressed |

---

## 7. Chat Refinement Surface

Every decision email links to a chat session. Chat is the **slow lane** — full proposal context, refinement, conversation, history. Email is the **fast lane** — one decision in five seconds.

### 7.1 What the Chat Shows on Open

When Tim taps "Open chat for full details" from a recipient-approval email, his chat opens with:

1. **`IntroProposalCard`** rendered inline as a ContentBlock, containing:
   - **Header:** "Mira found a possible intro — your decision before Tara is asked"
   - **The other person:** name, headline, photo if available, public links (no private claims about Tim that haven't been approved for sharing)
   - **Why this fits:** the `whyThisFits` rationale from `PossibleConnection`
   - **Why now:** optional `whyNow`
   - **Evidence panel:** expandable list of `evidence[]` with source labels (Brief 274) — Tim can verify each claim
   - **Risks/gaps:** any `risks[]` Ditto flagged — "She's quite a bit more senior", "Her last commercial-property mention is 2 years old"
   - **What Tara will see:** **a preview of the recipient approval email rendered inline** — Tim sees exactly what message goes to Tara before he approves. This is the trust-load-bearing element.
   - **What's private:** any private/on-request/hidden Active Request notes that *won't* be shared, listed so Tim sees Ditto isn't leaking
   - **Cost:** the `costLabel` (Brief 261) if applicable
   - **Affordances:** Send (same as email "Ask if open"), Edit before sending, Decline, Refine, Cancel
   - **State badge:** Considering / Your turn / Their turn / Introduced

2. **State log** below the card — running timeline of the intro: "Proposed at 14:03 from watch X" → "You approved at 14:05" → "Recipient asked at 14:05" → ...

3. **Conversation continues** — Tim can ask Mira anything: "what else do you know about her", "why not someone closer geographically", "show me 3 more options". This routes back to Brief 274 search/proposal logic.

### 7.2 The "Edit before sending" Affordance — Critical

Tim must be able to **edit the recipient-approval email draft before it goes out** (Brief 248 pattern; AuthorizationRequestBlock `draft` field).

- The draft is rendered as editable text inside `IntroProposalCard`.
- Edits are captured as feedback (Insight-208: edits ARE feedback). Mira learns Tim's voice from his edits and applies similar adjustments to future drafts.
- The edit cannot:
  - Add private/on-request/hidden claims about Tim that he hadn't approved for sharing
  - Add false claims about Tara
  - Impersonate Tim (it remains representative — Mira speaks AS Mira, not AS Tim)

### 7.3 Refusal Display

If a Possible Connection is refused before reaching the requester (Brief 261's four triggers — anti-persona, low-fit, user-block, rate-limit), the chat surface shows the refusal **with reason** and offers next steps:

| Refusal | What chat says | What user can do |
|---------|----------------|------------------|
| Anti-persona | "Tara explicitly said no to roofing/trades introductions — Mira respects that" | (Tim cannot override; he can ask for another match) |
| Low-fit | "This match scored below the threshold; here's why" | Tim can override with explicit "show me anyway", or refine the Active Request |
| User-block | "You marked Tara as 'don't introduce me to her again'" | Tim can lift the block from his side |
| Rate-limit | "You've sent 5 intros this hour — let's pace" | Wait or queue |

---

## 8. Natural-Language Reply Ingestion

Per Brief 276 Constraint: *"Natural replies count. Email replies like 'too junior, more commercial' must be parsed as feedback."*

### 8.1 The Reply Classifier — Extension

Current `classifyReply` in `inbound-email.ts` is keyword-based and returns one of six categories. Brief 276 extends this with intro-context classification:

When an inbound email is on an **intro-approval thread** or **follow-up thread**, the classifier additionally returns:

| Category | Trigger | Action |
|----------|---------|--------|
| `approve` | "yes", "go ahead", "introduce us", "do it" | Mint approval same as button click |
| `decline-not-fit` | "too junior", "too senior", "wrong domain", "not relevant" | Decline with structured reason; future watches learn the dimension |
| `decline-timing` | "not now", "ask me later", "next quarter" | Soft-decline with re-surface timer |
| `decline-block` | "don't ask me about this person again", "remove from list" | Add to user-block (Brief 261) |
| `question` | Contains "?" or starts with "what/why/how/who" | Route to chat, attach question, suggest answer |
| `refine` | Contains conditions like "more commercial", "only if X", "what about Y instead" | Capture as Active Request refinement, propose next iteration |
| `outcome-positive` (follow-up only) | "great conversation", "really useful", "meeting booked" | Record outcome; nudge for more detail |
| `outcome-negative` (follow-up only) | "didn't connect", "no reply", "not useful" | Record outcome; ask "what was missing?" |
| `ambiguous` | None of the above match confidently | Route to chat with proposed interpretation: "I read this as X — is that right?" |

**Open UX question (Architect):** Keyword classifier vs LLM classifier. The current pattern is keyword; LLM would handle nuance better but adds cost and a non-deterministic surface. Recommendation: **start keyword-augmented, escalate to LLM for `ambiguous` only**. The user-visible spec is the same either way — what matters for UX is that nothing terminal happens on an ambiguous classification (no decline, no send), only a chat clarification.

### 8.2 The "Edit is feedback" Loop

When Tim edits the recipient-approval draft before approving:

- The diff (original draft vs Tim's edits) is captured as structured feedback (`network_intro_feedback` row).
- Future drafts incorporate his edits (style, tone, what he likes to mention, what he scrubs out).
- The same applies to follow-up replies — Tara saying "tell people I'm not taking ecommerce consulting work right now" updates her Member Signal anti-persona.

---

## 9. Follow-up Cadence

| Trigger | Default | User control |
|---------|---------|---------------|
| Decision email (Q1 or Q2) sent | One reminder at +3 days if no response | User can disable in settings |
| Decision email expired | Quiet archive at +7 days; chat shows "paused — say 'resume' to revive" | User can re-open from chat |
| Warm intro thread sent | Follow-up at +14 days to both parties | User can adjust per-intro or globally |
| Follow-up first attempt no reply | One reminder at +7 days | User can disable reminders |
| Follow-up second attempt no reply | Archive as "outcome unknown" — no further nags | (terminal) |

**Critical: throttles compose with `notifyUser` global rules** (5 emails/user/day, 1hr min gap). If a user has been notified about something else, the intro reminder waits.

---

## 10. Process-Architecture Recommendations

These are UX-driven recommendations to the Architect. They are options, not decisions — the Architect synthesises with technical research.

### 10.1 The State Machine Should Be Inspectable

The 7-state consent machine should be **first-class in the audit log and in the chat surface**. Not "behind the scenes". Reasons:

- Jordan (the evaluator) needs to demo it.
- Nadia (the manager) needs to know what's stuck.
- Tim (the user) needs to trust that nothing happened off-script.

**Recommendation:** every state transition writes to `network_audit_events` and is rendered as a timeline entry in the chat surface for that intro. The timeline is **the** receipt for the consent process.

### 10.2 Email Templates Should Live in a Stable Directory

Currently emails are composed in code (`formatEmailBody()` and ad-hoc). Brief 276 introduces four new email types; if they live in code, they become hard to audit, hard to A/B test, hard to localise.

**Recommendation:** introduce `packages/web/components/emails/` (or equivalent) with one file per email type. Each template:
- Renders as MJML or React Email components for both HTML and plain-text bodies.
- Is inspectable by reading the file (no string concatenation hidden in handler logic).
- Has a fixture-driven test that snapshot-renders with mock inputs.

This makes the four email types **auditable as artifacts**, which matters for compliance review and Insight-235 (boundary at the transport, not behind a filter).

### 10.3 Email + Chat Are Two Surfaces of One Decision, Not Two Decisions

A decision made in chat should propagate to the email thread (close it). A decision made via email should propagate to chat (update the card). The user must never face "you already decided this elsewhere" friction.

**Recommendation:** the AuthorizationRequestBlock state IS the source of truth. The email is a render of the current state with action links that mutate the AuthorizationRequestBlock. The chat card is another render of the same state. There is no parallel "email-side" decision record.

### 10.4 Recipient's Workspace Receives a Persistent Artifact

Per Brief 259 cross-deployment delivery (Insight-234), when Tara receives the recipient-approval email, the underlying `IntroProposalCard` (recipient version, with what-Tim-is-asking-for content) must **also persist into Tara's workspace** via the durable outbox. This means:

- Tara can decide in email OR in her chat — same decision.
- The card survives across deployments and reloads.
- If Tara approves in her workspace, the AgentMail email thread reflects that (subsequent intro thread goes out).

**Recommendation:** the cross-deployment delivery for intro proposals is the same pattern as Brief 259; no new transport needed. The Architect should confirm Brief 259's outbox shape carries enough fields to render the recipient `IntroProposalCard`.

### 10.5 Outcome Capture Should Bias Toward Voluntary Disclosure

The follow-up should not feel like a survey. Lisa (evaluative persona) will not fill out a 12-field outcome form. Rob will not even open it if it looks like work.

**Recommendation:** the structured outcome questions are **optional** — the primary follow-up surface is "How did it go?" with a free-text reply that gets parsed. Structured questions appear only if the user clicks "Tell me more" or replies with structured selections. The economic-outcome data is best-effort; volume of outcome reporting matters less than truth of the few that are reported.

### 10.6 Decision Emails Must Be Distinguishable From Marketing

Tara opens her inbox. She sees "Mira may have found a fit" (intro approval) sitting alongside cold sales emails. The visual + copy distinction must be unmistakable:

- **No emoji in subject lines** (intro approvals are work, not promo).
- **No "[DISCOUNT][LIMITED TIME]" framing.**
- **Sender line shows "Mira (Tim's Ditto)" — the *whose* matters as much as the *what*.**
- **First line names the requester by full name and what they want.** Anonymity is a marketing tell; this is the opposite.

### 10.7 Reply Ambiguity Resolves in Chat, Not in Email

When a reply is ambiguous, the system MUST NOT auto-classify. It routes to chat with a proposed interpretation and asks for confirmation. Reason: a wrong auto-classification produces a wrong action (sending an intro when the user wasn't sure, or declining when they were just asking). Chat is the disambiguation surface.

---

## 11. Interaction States — Per Surface

Each surface must specify what it looks like across loading, empty, error, success, refused, and partial states. Below is the full matrix.

### 11.1 Decision Email Surface (any of the four types)

| State | Render |
|-------|--------|
| Composing (admin/test view) | Plain-text preview + HTML preview; sender/recipient fields visible; "send test" affordance |
| Sent (in user's inbox) | The four-template anatomy from §6 |
| Read receipt detected | Internal-only; chat shows "Tim opened the email" timestamp (telemetry, not surfaced to recipient) |
| Action taken via email link | Email becomes informational ("✓ You said yes — Tara has been asked"); chat updates |
| Action taken via chat | Email becomes informational ("✓ You said yes in chat — Tara has been asked") |
| Expired (no action after N days) | Email is auto-archived; one reminder sent at +3d; final state at +7d is "paused" |
| Suppression-blocked | No email sent; admin audit row; chat shows "Email blocked by compliance — operator review" |

### 11.2 `IntroProposalCard` in Chat

| State | Render |
|-------|--------|
| Loading | Skeleton: rationale lines + evidence bullets + CTA placeholder |
| Pending (awaiting requester) | Full card + "Ask if she's open" CTA + draft preview + edit affordance |
| Asking-recipient | Card collapses to "Asked Tara — awaiting her decision since 14:05" + state log |
| Recipient-approved | Card updates to "Tara approved — thread going out" + warm-intro draft preview if visible |
| Thread-sent | Card collapses to "Sent — thread link, last activity 2h ago" |
| Declined (either side) | Card shows reason, encourages refining or declining the watch; offers "ask Mira for something else" |
| Refused upstream (network health) | Card shows refusal reason + Brief 261 refusal copy |
| Error (compliance fail, transport fail) | Card shows "Mira hit a snag — operator notified"; the proposal does NOT auto-retry without user action |

### 11.3 Intro State Log Timeline

| State | Render |
|-------|--------|
| Empty (just created) | "Mira saved this proposal — no decisions yet" |
| Partial | Ordered list of transitions with timestamps |
| Full | "Mira saved this proposal at 14:00 → you approved at 14:03 → Tara was asked at 14:03 → Tara approved at 16:22 → Intro thread sent at 16:23 → Mira will check back on 2026-06-02" |
| Error | Failed step rendered in red with retry/operator-escalate option |

### 11.4 Follow-up Email Surface

Same five states as decision email, plus:

| State | Render |
|-------|--------|
| Outcome captured (positive) | Chat shows "Tim said the intro with Tara was useful — Mira will look for more like this" |
| Outcome captured (negative) | Chat asks "What was missing?" and uses the answer to refine future search |
| Outcome captured (no reply / never met) | Chat shows "No outcome reported — Mira will check less often for similar matches" |
| Willingness-to-pay signal | Captured in `network_intro_feedback`; surfaced to admin/operator dashboard (Brief 270/278) |

---

## 12. Source Patterns — Provenance Per Surface

| Surface | Source | Level | Notes |
|---------|--------|-------|-------|
| AuthorizationRequestBlock as consent gate | Briefs 248 + 261 + 259 | adopt | Existing primitive does the job |
| Two-sided consent state machine (7 states) | Original to Ditto | original | No public competitor exposes this state machine to users; Calendly/Lunchclub/etc. hide consent in marketing copy |
| Representative-not-impersonator email voice | Brief 259 | adopt | Hard Rule from Brief 259 §2 |
| Decision email anatomy (one reason + one action) | Apple Mail / GitHub PR review emails (cited general pattern, no exact source) | pattern | The "one decision per email" pattern is industry-standard; the Ditto-specific adaptations (chat link, natural-reply, cost label) are original |
| Magic link to chat | Brief 259 | adopt | 24h magic-link is existing |
| Natural-language reply as feedback | Ditto principle "edits are feedback" (Insight-208) | adopt + extend | Extension to follow-up classification is original |
| Post-intro outcome taxonomy | Brief 119 + Brief 270 (paid-successful-outcome pricing) | adopt | Aligns with Brief 270's pricing roadmap |
| Email templates as inspectable artifacts | React Email / MJML pattern | pattern | Standard pattern; no specific source needed |
| Cross-deployment delivery for recipient card | Brief 259 (Insight-234) | adopt | Same outbox shape |
| Throttles + suppression | Brief 283 / Brief 278 | adopt | Existing compliance gates |

---

## 13. Gaps Where No Existing Pattern Fits (Original to Ditto)

Marked explicitly for Architect attention:

1. **The "show me what they'll see before I approve" preview pattern.** Most consent flows show "approve / decline" — not "here is the literal email that will go to the other person, edit if you want". This is a Ditto-original, derived from the representative posture (Brief 259) and the "edits are feedback" principle (Insight-208).
2. **Recipient-side consent for receiving an intro request.** Lunchclub-style products typically do *not* ask the recipient before sending; the platform-level membership signals consent. Ditto explicitly asks. This is a Ditto-original consent surface.
3. **Natural-language follow-up reply parsed into economic-outcome taxonomy.** Most products either send no follow-up or send a structured survey. The "free-text reply parsed into outcome buckets" pattern is original.
4. **The state machine as user-facing inspectable timeline.** Most products surface "your intro is being processed" — Ditto exposes the full sequence: who consented when, what was shared, what's pending. This is consistent with Ditto's broader trust philosophy.

---

## 14. Reference Doc Status

**Reference docs checked:**

- `docs/personas.md` — used as primary lens; no drift found; Rob/Lisa/Jordan/Nadia framing applies cleanly to email + chat decision surfaces.
- `docs/human-layer.md` — used for six-jobs mapping and 26 ContentBlock palette; no drift. Curate is emerging-seventh-job (Insight-238); used here for decline taxonomy / outcome shaping behavior.
- `docs/architecture.md` — Network Agent + workspace IA sections referenced; no drift. Cross-deployment delivery pattern (Insight-234) carries.
- `docs/briefs/261-introductions-free-counter-workspace-upsell.md` — `costLabel`, refusal triggers, `introductions` table fields all reused. No drift.
- `docs/briefs/complete/259-public-profile-as-chat-and-representative-rule.md` — representative-posture hard rules adopted verbatim.
- `docs/briefs/275-background-watch-network-health.md` — watch-can-propose-not-contact handoff. Brief 276 owns the contact step; Brief 275 hands off via Possible Connection / Watch Proposal. No drift.

**Reference docs updated:** None — this spec is read-only against existing docs.

**Flag to PM/Architect:**
- If Brief 261's `introductions` table is sufficient, do not introduce parallel `network_intro_approvals` / `_threads` / `_feedback` tables — extend the existing one. The Architect should make this call after technical research. The UX is the same either way.
- If the keyword-vs-LLM reply classifier decision affects the user surface (e.g., higher latency for ambiguous replies), the Architect should re-visit §8.1 with the Designer.

---

## 15. Open Questions for the Human

1. **Reply parsing — keyword vs LLM.** The keyword classifier is fast and deterministic but brittle for nuanced replies ("too junior, more commercial"). Should we ship keyword-only and escalate to LLM on ambiguous, or LLM-first? Recommend keyword-first.
2. **Recipient email "from" identity.** The spec says "from the requester's persona" (Mira from Tim's workspace). An alternative is "from a neutral Ditto identity" (e.g., `intros@ditto.partners`). The chosen identity has different trust implications. Recommend requester-persona for warmth; revisit if compliance/deliverability suffers.
3. **Follow-up timing default.** 14 days post-thread-sent. Could be 7 or 21. Recommend 14; surface as user-configurable in settings.
4. **Decline reason taxonomy granularity.** Currently 6 categories (§8.1). Could compress to 3 ("not relevant / not now / not them") or expand to 10. Recommend 6 as the sweet spot — granular enough to learn from, simple enough to scan.
5. **"Edit before sending" — limits on impersonation.** Tim can edit Mira's draft. But Mira speaks AS Mira, not AS Tim. How explicit should the constraint be in the chat UI? Recommend: edit field is labeled "Mira's message to Tara — edit her words, but Mira is the speaker" so the representative posture is visible at edit time.

---

## 16. Acceptance — Designer's Self-Check

| Brief AC | UX spec address |
|----------|------------------|
| 1. Requester approval before recipient asked | §5.1 (state machine), §6.1, §7.1 (chat surface) |
| 2. Recipient approval before email thread | §5.1, §6.2, §6.3 |
| 3. `create_intro_thread(stepRunId, …)` stepRunId guard | §10.3 (state machine = source of truth; technical detail for Architect) |
| 4. Approval/feedback routes reject caller `stepRunId` | Technical; UX assumes server-minted runs |
| 5. Decision emails include one primary action + chat link + reply-natural-language | §6.1, §6.2 (all email templates) |
| 6. Chat context opens with full proposal rationale + evidence + risk + source labels | §7.1 |
| 7. Recipient email excludes private/on-request/hidden | §6.2 hard rules; §7.1 "what's private" panel |
| 8. Warm intro email sent only after both approvals + approved context | §6.3 |
| 9. Natural replies captured as feedback or routed to chat when ambiguous | §8.1 |
| 10. Declines capture reason categories | §8.1 |
| 11. Post-intro follow-up sent separately + records outcome | §6.4 |
| 11a. Outcome distinguishes no reply / useful / meeting / work-class / WTP | §6.4, §10.5 |
| 12. Follow-up feedback updates Member Signal / Active Request / search prefs | §8.2 |
| 13. All intro states persist + auditable | §10.1, §11.3 |
| 14. Brief 261 free-counter + refusal behavior intact | §6.1 (cost label), §7.3 (refusal display) |
| 15. Tests for two-sided approval / no-thread-before-consent / private scrub / compliance / reply ingestion / follow-up / wrapper bypass / stepRunId | Test coverage spec is for Architect/Builder; UX surfaces enable each test path |
| 16. Manual smoke covers test-mode email + state transitions | §11 (interaction states); §10.1 (timeline = smoke surface) |

---

**Designer's verdict:** The UX surface is large but composes cleanly on existing primitives. Four new email templates, one new chat component (`IntroProposalCard`), an extended reply classifier, and a state-log render. No new design system pieces, no new primitives. The trust load-bearing element is the **preview-what-they'll-see-before-approve** affordance; that is the single most important interaction to get right.

The biggest risk to the spec is **email deliverability and sender identity**. If recipient-approval emails are flagged as spam by Tara's mail provider, the entire consent chain breaks. This is a technical/deliverability question for the Researcher and the Architect, but the spec depends on it.
