# Web Acquisition Funnel — UX Interaction Spec

**Date:** 2026-04-06
**Author:** Dev Designer
**Status:** Reviewed — flags resolved
**Feeds:** Brief 085 (Sub-brief: Front Door Web Pages)

**Reference docs:**
- `DESIGN.md` — Design system (emerald, Inter, minimal, blocks-not-text). **This spec supersedes DESIGN.md Section 10 Page 1 (Home layout) and updates the front-door max-width from 480px to 640px.** See "DESIGN.md Updates Required" section below.
- `docs/ditto-character.md` — Character bible (Alex voice, house values)
- `docs/human-layer.md` — Six human jobs framework, 16 UI primitives
- `docs/architecture.md` — Process-as-primitive, user-type table (network participant → active user → workspace user)
- `docs/personas.md` — Rob, Lisa, Jordan, Nadia

---

## Design Thesis

The front door is a conversation, not a landing page. But a conversation with a stranger requires *earning the right to ask*. The universal pattern across Formless.ai, Boardy, Drift, and Replit is: **demonstrate value before requesting identity.** Alex's personality and insight are the value. The email ask is the natural next step after the user feels heard.

Every outreach email Alex sends creates a recipient who may visit the website. Every recipient is a potential user. The web surface must recognise their context and convert trust into sign-ups.

---

## Entry Points & User States

| Entry | Who | Context | Goal |
|-------|-----|---------|------|
| **Cold traffic** | Heard about Ditto, no prior contact | Zero context. Needs to understand + experience. | Conversation → email capture |
| **Outreach recipient** | Got an email from Alex | Has experienced the product. May be suspicious or curious. | Verify trust → respond OR sign up |
| **Referred recipient** | Introduced by Alex to someone | Experienced an introduction. Impressed. | "I want this too" → sign up |
| **Return visitor** | Previously gave email, coming back | Knows what Ditto is. Wants to check status or engage deeper. | Re-engage → workspace |

---

## Surface 1: Home Page — Conversational Front Door (`/`)

### Human Jobs Served

- **Orient** — "What is this? What can it do for me?"
- **Capture** — User's need/context captured through conversation (not a form). Email + optional need description flow to the intake record.

### The Interaction Model

**Phase 1: Alex introduces himself (0-3 seconds)**

Two messages, not five. Shorter is better — the current 5-message monologue takes 4.8 seconds before the user can do anything. Research shows value must be demonstrated in the first 3 seconds on mobile.

```
Alex: "Hey, I'm Alex from Ditto."

Alex: "I connect people who should know each other —
       and I remember every conversation."
```

Timing: message 1 at 0ms, message 2 at 800ms. Both use the staggered fade-in animation from the current implementation.

**Phase 2: The prompt appears (1.6 seconds)**

After both messages render, a prompt input fades in below. This is the Formless.ai moment — the user has agency.

```
┌──────────────────────────────────────────────┐
│  Ask me anything, or tell me what you need   │
│                                         [→]  │
└──────────────────────────────────────────────┘
```

Placeholder text: `"Ask me anything, or tell me what you need"` — deliberately open-ended. Not "Enter your email" (that's a form). Not "What's your biggest challenge?" (that's a survey). The user decides what to say.

**Note:** DESIGN.md specifies the prompt placeholder as `"Talk to Ditto..."` for the workspace. The front door uses a different placeholder because this is Alex talking (not Ditto) and the context is a first meeting (not an ongoing workspace relationship). DESIGN.md should add a front-door variant: `"Ask me anything, or tell me what you need"`. See "DESIGN.md Updates Required" below.

**Quick-reply suggestions** appear below the prompt as tappable pills (the Drift/Qualified pattern — tap over type, especially on mobile):

```
[Who do you work with?]  [How does this actually work?]  [I need to grow my network]
```

These are conversation starters, not form fields. Tapping one sends it as a message.

**Phase 3: Conversational exchange (1-3 turns)**

Alex responds via the `/api/network/chat` endpoint (new — lightweight conversational endpoint for the front door). Alex's responses are informed by the character bible:
- Warm, direct, Australian-inflected
- Asks follow-up questions that show curiosity
- Reframes vague requests into specific possibilities
- Never more than 3 sentences per turn

Example exchange:

```
User: "I need to grow my network in the logistics space"

Alex: "Logistics — that's a space where the right introduction
       beats a hundred cold emails. Are you looking to meet
       operators, or are you selling into logistics companies?"

User: "Selling into them. We have a fleet management tool."

Alex: "Got it. Fleet management for logistics companies —
       I know that space well. I'd want to understand your
       ideal customer better before I start making moves.
       Drop me your email and I'll send you a proper intro
       with some initial thoughts."
```

The email ask emerges naturally from the conversation. Alex doesn't switch to "form mode" — the prompt input simply accepts email when it detects one, or Alex's message includes an inline email field.

**Phase 4: Email capture (natural transition)**

When Alex asks for email, the prompt transforms. The text input gains an email-specific style:

```
Alex: "Drop me your email and I'll send you a proper intro."

┌──────────────────────────────────────────────┐
│  you@company.com                        [Go] │
└──────────────────────────────────────────────┘
  Your name (optional)
```

This is NOT a page change. The conversation continues visually. The prompt just adapts. If the user types a question instead of an email, Alex continues the conversation and asks again later.

**Phase 5: Post-submission engagement (see Surface 3 below)**

### The 3+ Question Nudge

If the user asks 3 questions without providing email, Alex gently nudges:

```
Alex: "I could talk about this all day — but honestly, the best
       thing I can do is email you with some specific people and
       ideas. What's your email? I'll make it worth your while."
```

This is a *soft* nudge, not a gate. The conversation continues if they ask another question. Alex nudges again at message 5, slightly more direct:

```
Alex: "Look — I'm good at this. But I need your email to actually
       do the work. No spam, no newsletter. Just me, introducing
       myself properly and sharing what I think I can do for you."
```

After 7 messages without email, Alex stops nudging and just converses. The email will be captured if the user wants it. Forcing converts no one.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ditto                          About  How It Works  [Sign in]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    ┌─────────────────────┐                   │
│                    │                     │                   │
│                    │  Alex: "Hey, I'm    │                   │
│                    │  Alex from Ditto."  │  max-width: 640px │
│                    │                     │                   │
│                    │  Alex: "I connect   │                   │
│                    │  people who should  │                   │
│                    │  know each other."  │                   │
│                    │                     │                   │
│                    │  User: "..."        │                   │
│                    │                     │                   │
│                    │  Alex: "..."        │                   │
│                    │                     │                   │
│                    │  ┌───────────────┐  │                   │
│                    │  │ Prompt input  │  │                   │
│                    │  └───────────────┘  │                   │
│                    │  [pill] [pill] [pill]│                   │
│                    │                     │                   │
│                    └─────────────────────┘                   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  TWO VALUE CARDS (below the fold — safety net for scrollers) │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │  Super-Connector     │  │  Chief of Staff      │         │
│  │  "AI outreach that   │  │  "The antidote to    │         │
│  │  people actually     │  │  AI you can't trust" │         │
│  │  respond to"         │  │                      │         │
│  │  [Learn more →]      │  │  [Learn more →]      │         │
│  └──────────────────────┘  └──────────────────────┘         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  TRUST ROW                                                   │
│  "Remembers everything." "Earns your trust." "No spam, ever."│
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [Footer]                                                    │
└──────────────────────────────────────────────────────────────┘
```

The conversation area is vertically centered in the viewport on load (no scrolling needed). The value cards and trust row are below the fold — they exist for scrollers who want more context before engaging.

**Note: max-width 640px** — DESIGN.md specifies 480px for the front door card, which was designed for a static greeting card. A multi-turn conversation with quick-reply pills needs more breathing room. 640px keeps the intimate feel while preventing cramped text at 3+ turns. DESIGN.md must be updated (see "DESIGN.md Updates Required" below).

### Interaction States

| State | What the user sees |
|-------|-------------------|
| **Loading** | White page, "ditto" wordmark appears immediately. Messages fade in on delay. No spinner. |
| **Waiting for Alex** | Typing indicator (three dots, subtle pulse). Max 3 seconds before timeout message. |
| **Error (API)** | Alex: "Sorry — something went wrong on my end. Drop your email and I'll reach out directly." Falls back to email form. |
| **Email submitted** | Transitions to Phase 5 (post-submission). |
| **Returning visitor** | If email exists in localStorage, Alex greets differently: "Hey again. Check your email — I sent you something." |

### Mobile Behaviour

- Full-width conversation, 16px horizontal padding
- Quick-reply pills stack horizontally, scroll if needed
- Prompt pinned to bottom of viewport (like a messaging app)
- Value cards stack vertically below
- Keyboard pushes conversation up naturally (no layout shift)

---

## Surface 2: Verify Page (`/verify`)

### Human Jobs Served

- **Orient** — "Is this email from Alex real?"
- **Decide** — "Do I respond? Do I want this for myself?"

### Who Arrives Here

Someone who received an email from Alex (outreach or introduction). They're either:
1. **Suspicious** — "Who is Alex? Is this a scam?" → Needs trust confirmation
2. **Curious** — "This was good. What is Ditto?" → Needs the pitch
3. **Interested** — "I want this for my business" → Needs the sign-up path

### The Flow

**Step 1: Simple entry**

The page opens with Alex's voice (consistent with the front door):

```
Alex: "Got an email from me and wondering if it's real?
       I don't blame you. Enter the email address I
       contacted you on and I'll check."

┌──────────────────────────────────────────────┐
│  The email address Alex contacted you on     │
│  you@company.com                        [→]  │
└──────────────────────────────────────────────┘
```

Clean, centered, max-width 480px. Same design language as the front door.

**Step 2: Uniform response (anti-enumeration)**

Regardless of whether the email is found in Ditto's outreach database, the user sees the **same response**. This eliminates the email enumeration oracle — an attacker cannot probe which emails exist in the system.

```
┌──────────────────────────────────────────────┐
│  ✓ Checking                                  │
│                                              │
│  Alex: "If that email's from me, I've just   │
│  sent you a verification to that address.    │
│  Check your inbox — it'll confirm what I     │
│  reached out about and give you a way to     │
│  reply directly."                            │
│                                              │
│  "Nothing in your inbox in the next few      │
│  minutes? Then the email probably wasn't      │
│  from me. Trust your instincts."             │
│                                              │
│  ─────────────────────────────────────────── │
│                                              │
│  Curious about what I do?                    │
│                                              │
│  Alex: "Whether or not that email was mine,  │
│  I'm an AI advisor that makes introductions  │
│  people actually respond to. No spam, no     │
│  volume games — just thoughtful connections." │
│                                              │
│  [Tell me more →]                            │
│                                              │
└──────────────────────────────────────────────┘
```

**What happens server-side:**
- If the email IS in the outreach database: send a verification email to that address confirming the outreach (date, general topic, reply link). The recipient confirms in their own inbox — no information leaks to the web page.
- If the email is NOT found: no email sent. The recipient never receives the verification, which is itself the answer. No oracle.

**The verification email (sent to the recipient's inbox):**

```
Subject: Verifying your email from Alex at Ditto

Hey — you just checked whether an email from me was genuine.
It was. I reached out on March 28 about an introduction.

Everything you received was real. If you'd like to continue
the conversation, just reply to the original email or hit
reply here.

— Alex
```

This pattern is borrowed from passwordless auth flows (Magic Links) — shift the confirmation to the channel you're trying to verify.

**Security constraints:**
- The `/api/network/verify` endpoint MUST return the same response and timing regardless of hit/miss (constant-time, same HTTP status)
- Rate limit: max 5 verify lookups per IP per hour
- No CAPTCHA needed because no information is disclosed on the web page
- Verification email includes a rate limit: max 1 verification email per recipient per 24 hours

### The Acquisition Conversion

The "Tell me more" CTA on the verify page links to `/welcome/referred` (Surface 4) — not the generic front door. The recipient has already experienced Alex's quality. The messaging should acknowledge that.

### Interaction States

| State | What the user sees |
|-------|-------------------|
| **Loading** | White page, "ditto" wordmark, Alex's greeting fades in. |
| **Submitting** | Brief pulse on the check icon. No spinner. |
| **Result shown** | Same response regardless of found/not-found. Verification email sent (or not) silently. |
| **Rate limited** | Alex: "You've checked a few times — if you're not getting a verification email, the original message probably wasn't from me." |

### Layout

Same clean centered column as the front door. Max-width 480px. Alex's voice throughout (no system messages). The "Curious about what I do?" section with the "Tell me more" CTA provides a forward path regardless of verification outcome.

### Mobile Behaviour

- Primary use case is mobile (clicking a link in their email app)
- Full-width, generous touch targets
- Verification email arrives in the same inbox they're already in — zero context-switching
- Single-scroll, no tabs or navigation complexity

---

## Surface 3: Post-Submission Engagement

### Human Jobs Served

- **Capture** — Alex learns something useful before the first email
- **Orient** — User understands what happens next

### The Flow

After email submission on the front door, the conversation doesn't end — it deepens.

**Immediately after submission:**

```
Alex: "Nice one. I'll email you shortly."

Alex: "One quick thing before I do — what's the biggest
       networking or outreach challenge you're facing right now?
       Helps me make the first email actually useful."

┌──────────────────────────────────────────────┐
│  e.g. "Finding the right people in fintech"  │
│                                         [→]  │
└──────────────────────────────────────────────┘

  [Skip — just email me →]
```

**If user responds:**

```
User: "I keep getting ignored when I reach out to CTOs"

Alex: "That's common — and fixable. I'll include some thoughts
       on that in my email. Talk soon."
```

The response is stored as `need` in the intake record and feeds Alex's first email. This is the Formless.ai pattern: structured data extracted from conversation.

**If user skips:**

```
Alex: "No worries. I'll introduce myself properly over email.
       Talk soon."
```

**Then, in both cases, show the "What happens next" timeline:**

```
┌──────────────────────────────────────────────┐
│  What happens next                           │
│                                              │
│  1. Alex emails you (within the hour)        │
│     ↓                                        │
│  2. You reply when you're ready              │
│     ↓                                        │
│  3. Alex starts working your network         │
│                                              │
│  "No account needed. No app to download.     │
│   It all happens in your inbox."             │
└──────────────────────────────────────────────┘
```

This timeline serves Orient — the user knows what to expect. "No account needed" reduces anxiety. "It all happens in your inbox" signals that Ditto meets them where they are.

### Interaction States

| State | What happens |
|-------|-------------|
| **Skip clicked** | Follow-up question disappears. Timeline shows. |
| **Response submitted** | Alex acknowledges. Timeline shows. |
| **API error on follow-up** | Silently fails. Timeline still shows. The follow-up is enrichment, not critical path. |

---

## Surface 4: Recipient-to-User Path (`/welcome/referred`)

### Human Jobs Served

- **Orient** — "What is this thing that just worked on me?"
- **Delegate** — "I want one too"

### Who Arrives Here

Two audiences:
1. **Outreach recipient** who clicked "Tell me more" on the verify page
2. **Introduction recipient** who clicked the footer link in Alex's email

Both have experienced Alex's quality. They don't need to be sold on the concept — they've felt it. The page should acknowledge this.

### The Flow

**Hero — contextual acknowledgment:**

```
Alex: "You've seen how I work — an introduction that was
       actually worth your time. Imagine having an advisor
       like that working your own network."
```

No repetition of the generic pitch. Alex speaks directly to their experience.

**Then: the same conversational intake as the front door, but warmer:**

```
Alex: "Tell me a bit about what you're working on, and
       I'll show you what I can do."

┌──────────────────────────────────────────────┐
│  What are you building or working on?        │
│                                         [→]  │
└──────────────────────────────────────────────┘

[I run a business]  [I'm a connector]  [Just curious]
```

The quick-reply pills here are tailored to referred users (who are likely business owners or connectors, not cold traffic).

The rest of the flow matches the front door: 1-2 conversational exchanges, then natural email ask.

### Email Footer Link Design

Every outreach email from Alex includes a subtle footer:

```
────────────────────────────────────────
Sent by Alex from Ditto — AI-powered introductions.
Want your own advisor? Learn more → [link]
────────────────────────────────────────
```

- Subtle, not promotional. One line. Below the email signature.
- The link goes to `/welcome/referred`
- Must not compete with the email's primary CTA (the introduction itself)
- Must be present but not prominent — the outreach must stand on its own merit

### Interaction States

| State | What the user sees |
|-------|-------------------|
| **Loading** | White page, "ditto" wordmark, Alex's contextual greeting fades in. No spinner. |
| **Waiting for Alex** | Typing indicator (three dots, subtle pulse). Same as front door. |
| **Error (API)** | Alex: "Something went wrong on my end. Drop your email and I'll reach out directly." Falls back to email form. |
| **Email submitted** | Transitions to Surface 3 (post-submission engagement). |
| **Returning visitor** | If email exists in localStorage (already signed up via this or another surface): Alex: "Hey — you're already in. Check your email for my latest." No redundant intake. |
| **Already a Ditto user** | If the referred visitor's email matches an existing network user (detected after email capture): Alex: "Turns out we already know each other! Check your inbox — I'll pick up where we left off." |

### Layout

Same centered column. Same Alex voice. The only difference from the front door is the opening message acknowledges their context. Everything else (prompt, pills, email capture, post-submission) is shared.

---

## Cross-Surface Design Decisions

### Conversation API

All four surfaces need Alex to respond conversationally. This requires a lightweight endpoint:

```
POST /api/network/chat
{
  "message": "string",
  "sessionId": "string (localStorage)",
  "context": "front-door | verify | referred"
}
```

Response includes Alex's message and optionally a `requestEmail: true` flag when Alex decides to ask for email. The front-end interprets this flag to transform the prompt into an email input.

This is a design requirement, not an implementation spec — the Architect decides how to build it.

### Session Continuity

Each visitor gets a `sessionId` stored in localStorage. If they return, Alex can reference prior conversation:

```
Alex: "Hey again — we talked about fleet management last time.
       Still want me to look into that? Drop your email and
       I'll get moving."
```

This is Memory as Continuity (house value #4) demonstrated from the very first interaction.

### Alex's Tone Across Surfaces

| Surface | Alex's posture | Example |
|---------|---------------|---------|
| Front door | Curious, warm, slightly casual | "Tell me more about that — sounds like you're in an interesting space." |
| Verify | Reassuring, direct, credible | "Yep, that was me. I thought it was a conversation worth having." |
| Post-submission | Efficient, forward-looking | "Nice one. One quick thing before I email you..." |
| Referred | Acknowledging, confident | "You've seen how I work. Let me show you what I can do for you." |

All are Alex. All follow the character bible. The tone shifts with context, not personality.

### What We Don't Build Yet

1. **Real-time metrics** ("Alex has made 847 introductions") — Not until they're real and meaningful.
2. **Social proof** ("Trusted by X") — Not until we have it.
3. **Product screenshots** — Not until the workspace is polished.
4. **Video/animation** — DESIGN.md says no decorative animation. Motion is functional only.
5. **User Agent creation** — The front door is about meeting Alex. The user agent comes later in the relationship.

---

## Conversion Funnel Metrics (Proposed)

| Metric | What it measures | Target |
|--------|-----------------|--------|
| **Conversation start rate** | % of visitors who send at least one message | >40% |
| **Email capture rate** | % of conversations that end with email | >25% |
| **Post-submission engagement** | % who answer the follow-up question | >30% |
| **Verify page visits** | % of outreach recipients who visit /verify | Track (no target yet) |
| **Verify → sign-up conversion** | % who click "Tell me more" after verifying | >15% |
| **Referred → email capture** | % of referred visitors who give email | >40% (warm traffic) |
| **Time to email capture** | Median seconds from page load to email submitted | <90 seconds |

### Instrumentation

Events are captured server-side via the `/api/network/chat` endpoint (which already handles every conversation turn). Each event includes `sessionId`, `surface` (front-door/verify/referred), `timestamp`, and the event type:

| Event | When fired |
|-------|-----------|
| `conversation_started` | First user message on any surface |
| `email_captured` | Email submitted successfully |
| `post_submission_answered` | User answers the follow-up question |
| `post_submission_skipped` | User clicks "Skip — just email me" |
| `verify_requested` | Email entered on verify page |
| `verify_cta_clicked` | "Tell me more" clicked on verify page |
| `referred_landed` | Page load on `/welcome/referred` |
| `quick_reply_used` | User tapped a quick-reply pill (includes pill text) |
| `nudge_shown` | Email nudge displayed (includes nudge number: 1, 2) |

These events feed two systems:
1. **Funnel analytics** — conversion rates, drop-off points, time-to-capture (dashboard TBD)
2. **Alex's conversation quality** — which opening messages, pill options, and nudge patterns produce higher email capture rates. This is the feedback loop that improves the front door over time.

---

## Personas Test

### Rob (trades business MD, mobile between jobs)
- **Front door:** Quick-reply pills are essential — Rob won't type paragraphs on his phone. "I need to grow my network" pill → 2 turns → email. Under 60 seconds.
- **Verify:** Mobile-first. Rob gets Alex's email, clicks verify link from his phone. Clean, fast, one-scroll. Verification email arrives in same inbox he's already in.
- **Post-submission:** Rob will skip the follow-up question. That's fine — the skip path is designed for him.
- **Referred:** Rob sees an intro from Alex, thinks "I want this." The footer link must work on mobile without friction. Quick-reply pill "I run a business" is his entry.

### Lisa (ecommerce, brand-conscious)
- **Front door:** Lisa cares about quality. The conversation must demonstrate Alex's intelligence, not just collect her email. The follow-up question ("what's your challenge?") signals that Ditto does homework.
- **Verify:** Lisa is brand-conscious — she'll verify to confirm the email is legitimate before responding. The inbox-confirmation pattern reassures without exposing data.
- **Post-submission:** Lisa will answer the follow-up. She wants Alex to understand her brand and audience. This enrichment makes her first email dramatically better.
- **Referred:** Lisa is the most likely referred-to-user conversion. She'll click "Tell me more" because she appreciated the quality of the introduction.

### Jordan (technologist, wants to demo to leadership)
- **Front door:** Jordan needs the value cards below the fold. The conversation hooks interest; the cards give enough substance to justify showing leadership.
- **Verify:** Jordan is least likely to need verify — more likely to sign up directly after hearing about Ditto.
- **Post-submission:** Jordan will answer with something technical and specific. Alex should handle this well — the conversational endpoint needs to be smart enough for technical users.
- **Referred:** Jordan arrives via a peer introduction. The "Just curious" pill matches his exploration style. He'll evaluate before committing.

### Nadia (team manager, quality-focused)
- **Front door:** Nadia values the "How It Works" link in nav. She'll read supporting pages before giving email. The trust row ("Earns your trust", "No spam, ever") resonates strongly.
- **Verify:** Nadia is thorough — she'll verify any unexpected email. The inbox-confirmation pattern aligns with her careful approach.
- **Post-submission:** Nadia is most likely to answer the follow-up question. She's thorough and appreciates that Alex asks before acting.
- **Referred:** Nadia arrives via an introduction that was well-structured. She notices quality. The referred page's contextual acknowledgment ("You've seen how I work") validates her experience.

---

## Insight Candidates

Two potential insights emerged during this design work:

1. **Value before identity is the universal conversion pattern.** Every high-performing conversational front door (Formless, Replit, Drift) demonstrates value before requesting identity. For Ditto, Alex's conversational intelligence IS the value demonstration. The conversation is the product sample.

2. **Every outreach email is a two-sided acquisition channel.** The recipient can become a user (verify → sign up) AND the quality of the outreach reinforces the sender's relationship with Ditto. This is Insight-147 extended: the verify page is where trust converts to growth.

---

## DESIGN.md Updates Required

This spec supersedes parts of DESIGN.md. The following changes must be made to DESIGN.md before or during the build phase:

| Section | Current | Updated | Rationale |
|---------|---------|---------|-----------|
| **Section 5: Front Door Layout** | `max-width: 480px` for front door card | `max-width: 640px` for conversational front door | Multi-turn conversation with quick-reply pills needs more breathing room. 480px was designed for a static greeting card. |
| **Section 10: Page 1 (Home `/`)** | Hero with display headline + subhead + "[Talk to Ditto]" CTA button, then value cards | **Conversation IS the hero.** Alex's greeting replaces the headline. Prompt input replaces the CTA button. Value cards remain below the fold. | The Formless.ai direction means the front door is a conversation, not a landing page with a button that opens a conversation. This is a philosophical shift: the page IS the interaction, not a pitch that leads to an interaction. |
| **Section 4: Prompt Input** | Placeholder: `"Talk to Ditto..."` | Add front-door variant: `"Ask me anything, or tell me what you need"` | The front door is Alex's surface (not Ditto's workspace). Different context, different placeholder. |
| **Section 10: Page Map** | 6 pages listed | Add `/verify` and `/welcome/referred` | Two new pages for the acquisition funnel. |

---

## Open Questions for the Architect

1. **Conversational endpoint design.** The front door needs Alex to respond in real-time. What's the simplest architecture? Streaming vs. complete response? Rate limiting for anonymous users?

2. **Session storage.** localStorage for sessionId, but conversation history needs to persist server-side for Alex's context. Where does this live? Ephemeral (TTL) or permanent (intake record)?

3. **Verify data access.** The verify endpoint needs to look up outreach by recipient email and return limited information. What's the data model? How do we ensure no sensitive data leaks?

4. **Email detection in prompt.** When Alex asks for email, how does the front-end detect that the user typed an email vs. a question? Client-side regex? Server flag?

5. **Quick-reply pill content.** Should pills be static per surface, or dynamic based on Alex's context? Static is simpler. Dynamic is smarter.
