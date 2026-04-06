# Brief 094: Conversational Home Page

**Date:** 2026-04-06
**Status:** draft
**Depends on:** Brief 093 (Front Door Chat API)
**Unlocks:** Brief 095 (Verify + Referred Pages — shares conversation components)

## Goal

- **Roadmap phase:** Phase 14: Network Agent
- **Capabilities:** Formless.ai-style conversational front door replacing the current monologue, quick-reply pills, natural email capture transition, post-submission engagement, value cards + trust row below the fold, DESIGN.md updates

## Context

The current home page (`/welcome`) shows 5 pre-scripted Alex messages over 4.8 seconds, then an email form. The user has zero agency until the form appears. The UX interaction spec (`docs/research/web-acquisition-funnel-ux.md`) redesigns this as a real conversation where Alex demonstrates value before requesting identity.

This brief replaces the `DittoConversation` component with a conversational interface powered by Brief 093's chat API.

## Non-Goals

- **Chat API endpoint or session management.** That's Brief 093 (already built).
- **Verify page or referred page.** That's Brief 095.
- **Workspace features.** The front door is pre-workspace. No sidebar, no panels.
- **Dark mode.** Light mode only for the front door.
- **Supporting pages (About, How It Works, Network, Chief of Staff).** These already exist and are unchanged.

## Inputs

1. `docs/research/web-acquisition-funnel-ux.md` — Surface 1 (Home Page) + Surface 3 (Post-Submission) interaction spec
2. `DESIGN.md` — Design system. Must be updated as part of this brief (see "DESIGN.md Updates Required" in the UX spec).
3. `packages/web/app/welcome/ditto-conversation.tsx` — Current component being replaced
4. `packages/web/components/marketing/` — Existing marketing components (SiteNav, SiteFooter, IntakeForm, MarketingLayout)
5. `packages/web/app/api/network/chat/route.ts` — Chat API from Brief 093

## Constraints

- **Conversation max-width: 640px.** Updated from DESIGN.md's 480px per the UX spec rationale.
- **Two Alex intro messages, not five.** Prompt appears at 1.6 seconds, not 4.8 seconds.
- **Quick-reply pills are static per surface.** Dynamic pills are a follow-up. Front door pills: "Who do you work with?", "How does this actually work?", "I need to grow my network".
- **Email capture is a prompt transformation, not a page change.** The conversation continues visually.
- **Error fallback: always to email form.** If the chat API fails, the user can still drop their email. Never a dead end.
- **No decorative animation.** Motion is functional only per DESIGN.md. Message fade-in, typing indicator, prompt transition — all functional.
- **Must preserve the existing marketing pages.** Nav links to About, How It Works still work. SiteNav and SiteFooter are reused.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Conversational front door | Formless.ai, Boardy.ai | pattern | Conversation IS the landing page, not a widget on a landing page |
| Quick-reply pills | Drift, Qualified chatbots | pattern | Tap over type, especially on mobile. Reduces friction for first message. |
| Post-submission enrichment | Formless.ai ("structured data from conversation") | pattern | Optional follow-up question after email capture enriches intake |
| "What happens next" timeline | Onboarding step indicators (Notion, Linear) | pattern | Orient the user on next steps after committing |
| Value cards below fold | DESIGN.md Section 10 (already specified) | existing | Safety net for cold traffic scrollers |
| Typing indicator | iMessage, WhatsApp | pattern | Social cue that Alex is "thinking" |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/welcome/ditto-conversation.tsx` | Rewrite: Replace 5-message monologue + email form with conversational interface. Two intro messages → prompt input → chat API integration → email capture transition → post-submission engagement. |
| `packages/web/app/welcome/quick-reply-pills.tsx` | Create: Reusable pill component. Props: `pills: string[]`, `onSelect: (pill: string) => void`, `disabled: boolean`. Horizontal scroll on mobile. |
| `packages/web/app/welcome/chat-message.tsx` | Create: Single message bubble component. Props: `role: "alex" \| "user"`, `text: string`, `animate: boolean`. Alex messages left-aligned with subtle styling. User messages right-aligned. |
| `packages/web/app/welcome/post-submission.tsx` | Create: Post-submission phase. Follow-up question from Alex, skip option, "What happens next" timeline. |
| `packages/web/app/welcome/value-cards.tsx` | Create: Two-card section below conversation. Super-Connector + Chief of Staff cards with "Learn more →" links. |
| `packages/web/app/welcome/trust-row.tsx` | Create: Three trust statements in a row. "Remembers everything." "Earns your trust." "No spam, ever." |
| `packages/web/app/welcome/typing-indicator.tsx` | Create: Three-dot pulse animation. Appears during API calls. |
| `DESIGN.md` | Modify: Update Section 5 (front-door max-width 480→640), Section 10 Page 1 (conversation-first layout), Section 4 (add front-door placeholder variant), Section 10 Page Map (add /verify and /welcome/referred). |
| `packages/web/app/globals.css` | Modify: Add animation keyframes for message fade-in and typing indicator if not already present. |

## User Experience

- **Jobs affected:** Orient ("What is this?"), Capture (email + need via conversation)
- **Primitives involved:** ConversationThread (adapted for pre-workspace), PromptInput (front-door variant)
- **Process-owner perspective:** Visitor arrives, sees Alex greet them, has a real conversation, gives email when it feels natural, gets told what happens next. Under 90 seconds from landing to email captured.
- **Interaction states:**
  - Loading: white page, wordmark, messages fade in
  - Conversing: typing indicator → Alex response → prompt re-enables
  - Email capture: prompt transforms to email input on `requestEmail` flag
  - Post-submission: follow-up question → skip or answer → timeline
  - Error: Alex apologises, falls back to email-only form
  - Returning visitor: localStorage check, Alex greets differently
- **Designer input:** `docs/research/web-acquisition-funnel-ux.md` — Surface 1 and Surface 3 fully specified

## Acceptance Criteria

1. [ ] Home page (`/welcome`) shows two Alex intro messages (not five). Second message appears at 800ms.
2. [ ] Prompt input with placeholder "Ask me anything, or tell me what you need" appears at 1.6 seconds.
3. [ ] Three quick-reply pills render below the prompt. Tapping one sends it as a user message.
4. [ ] User message appears right-aligned. Alex typing indicator shows. Alex response appears left-aligned.
5. [ ] Chat API (`POST /api/v1/network/chat`) is called on each user message. Conversation history is maintained via `sessionId` in localStorage.
6. [ ] When Alex's response includes `requestEmail: true`, the prompt transforms to an email input (placeholder: `you@company.com`) with an optional name field below.
7. [ ] If user types a question when email input is shown, the message is sent to chat API (prompt reverts to conversation mode). Alex continues and asks for email again later.
8. [ ] Email submission calls `POST /api/network/chat` with the email as the message (which triggers intake via Brief 093's email detection).
9. [ ] After email submission, Alex's follow-up question appears: "What's the biggest networking or outreach challenge you're facing right now?" with a text input and "Skip — just email me" link.
10. [ ] Skipping shows Alex's "No worries" message + "What happens next" 3-step timeline.
11. [ ] Answering the follow-up shows Alex's acknowledgment + the same timeline.
12. [ ] Two value prop cards (Super-Connector + Chief of Staff) render below the fold with "Learn more →" links to `/network` and `/chief-of-staff`.
13. [ ] Trust row renders: "Remembers everything." "Earns your trust." "No spam, ever."
14. [ ] On API error, Alex shows: "Sorry — something went wrong on my end. Drop your email and I'll reach out directly." with a simple email form fallback.
15. [ ] Returning visitor (email in localStorage) sees: "Hey again. Check your email — I sent you something." instead of the intro flow.
16. [ ] Conversation area max-width is 640px, vertically centered in viewport on load.
17. [ ] Mobile: full-width with 16px padding, prompt pinned to bottom, pills scroll horizontally, value cards stack vertically.
18. [ ] DESIGN.md updated: Section 5 (640px), Section 9 Agent Prompt Guide (front door 480→640), Section 10 Page 1 (conversation-first), Section 4 (placeholder variant), Section 10 Page Map (/verify, /welcome/referred added).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `DESIGN.md`
2. Review agent checks: Does the conversation match the UX spec? Does the component respect DESIGN.md design tokens (colors, type, spacing)? Is the error fallback robust? Does mobile behaviour match the spec? Is DESIGN.md correctly updated?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Start dev server
pnpm dev

# Open http://localhost:3000 in browser
# Expect: Two Alex messages appear, then prompt + pills

# Click "I need to grow my network" pill
# Expect: Message appears as user bubble, typing indicator, Alex responds

# Type "I sell fleet management tools" and send
# Expect: Alex responds with context from prior turn, asks for email

# Enter email: tim@example.com
# Expect: Prompt transforms, submission triggers intake, follow-up question appears

# Click "Skip — just email me"
# Expect: Alex says "No worries", timeline appears

# Scroll down
# Expect: Two value cards + trust row visible

# Test mobile: resize to 375px width
# Expect: Full-width layout, pills scroll, prompt at bottom

# Test error: disconnect network, send message
# Expect: Alex error message + email fallback form
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `DESIGN.md` (included in work products above)
3. Proceed to Brief 095 (Verify + Referred Pages)
