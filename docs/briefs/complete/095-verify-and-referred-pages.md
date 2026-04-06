# Brief 095: Verify Page + Recipient-to-User Path

**Date:** 2026-04-06
**Status:** draft
**Depends on:** Brief 093 (Front Door Chat API), Brief 094 (Conversational Home Page — shared components)
**Unlocks:** Full acquisition funnel operational. Outreach emails can include verify + referral links.

## Goal

- **Roadmap phase:** Phase 14: Network Agent
- **Capabilities:** Anti-enumeration verify page (`/verify`), verification email sending, recipient-to-user referred page (`/welcome/referred`), email footer link template for outreach

## Context

Every email Alex sends is a growth opportunity (Insight-147). Recipients need two things: (1) a way to confirm the email is genuine (trust bridge), and (2) a path to become Ditto users themselves. The UX interaction spec (`docs/research/web-acquisition-funnel-ux.md`) designs both as Surfaces 2 and 4.

The existing `/api/network/verify` endpoint returns different responses for found/not-found emails, creating an enumeration oracle. This brief replaces it with a uniform-response pattern that shifts confirmation to the recipient's inbox.

## Non-Goals

- **Chat API or session management.** That's Brief 093.
- **Home page conversation component.** That's Brief 094 (though we reuse its components).
- **Outreach email composition or sending logic.** Existing network-tools handle that. This brief only defines the footer link template.
- **Analytics dashboard for funnel metrics.** Events are recorded (Brief 093); dashboard is future work.

## Inputs

1. `docs/research/web-acquisition-funnel-ux.md` — Surface 2 (Verify) + Surface 4 (Referred) interaction spec
2. `packages/web/app/api/network/verify/route.ts` — Existing verify endpoint to be replaced
3. `packages/web/app/api/v1/network/verify/route.ts` — Versioned verify endpoint to be replaced
4. `src/engine/self-tools/network-tools.ts` — Existing `verifyOutreach()` function
5. `packages/web/app/welcome/` — Shared conversation components from Brief 094
6. `src/engine/persona.ts` — Alex persona config for verification email voice
7. `docs/ditto-character.md` — Alex's voice for verify page and verification email copy

## Constraints

- **Uniform response on verify page.** The web page MUST show the same message regardless of whether the email is found. No information oracle.
- **Constant-time verify endpoint via fixed-delay floor.** The endpoint always responds after a fixed delay (e.g., 500ms) regardless of whether the email was found. The verification email is sent asynchronously (fire-and-forget) within the delay window. This is simpler and more reliable than trying to make both code paths take equal time, because the email-sending path is inherently slower. The response is composed before the delay starts; the delay just gates when it's sent.
- **Rate limit: 5 verify lookups per IP per hour.** Prevents enumeration via timing or volume.
- **Verification email rate limit: 1 per recipient email per 24 hours.** Prevents the endpoint being used to spam arbitrary email addresses.
- **Verification email uses Alex's voice.** Not a system email. Consistent with the character bible.
- **Referred page reuses conversation components from Brief 094.** No duplicate component implementations.
- **The email footer link must not compete with the outreach's primary CTA.** Subtle, below the signature.
- **The verification email is sent to the recipient's address, never to the submitter.** The submitter cannot observe whether a verification email was sent to someone else. This is the core anti-enumeration guarantee — make it explicit in the code and comments so a future builder doesn't accidentally reverse it.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Uniform response (anti-enumeration) | Passwordless auth / Magic Link flows (Auth0, Clerk) | pattern | Shift confirmation to the channel being verified. No oracle on the web page. |
| Constant-time response | Timing attack prevention (bcrypt, crypto.timingSafeEqual) | pattern | Prevent enumeration via response timing |
| Rate limiting per IP | Industry standard | pattern | Abuse prevention |
| Verification email to own inbox | Email verification flows (Stripe, GitHub) | pattern | Confirm ownership by sending to the address being verified |
| Referred landing with contextual greeting | Referral program landing pages (Dropbox, Notion) | pattern | Acknowledge the referrer's context, don't repeat the generic pitch |
| Email footer CTA | Calendly, Loom email footers | pattern | Subtle product link in transactional email, not promotional |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/verify/page.tsx` | Create: Verify page. Alex greeting, email input, uniform "check your inbox" response, "Tell me more" CTA linking to `/welcome/referred`. |
| `packages/web/app/welcome/referred/page.tsx` | Create: Referred intake page. Contextual Alex greeting ("You've seen how I work..."), then conversational intake reusing Brief 094 components (chat-message, quick-reply-pills, post-submission). Tailored pills: "I run a business", "I'm a connector", "Just curious". |
| `packages/web/app/api/network/verify/route.ts` | Rewrite: Uniform response regardless of hit/miss. If found, send verification email silently. Fixed response timing. Rate limit check. |
| `packages/web/app/api/v1/network/verify/route.ts` | Rewrite: Same changes as above for versioned endpoint. |
| `src/engine/network-verify.ts` | Create: `handleVerify(email, ipHash)` — checks outreach database, sends verification email if found, returns uniform result. `sendVerificationEmail(email, outreachRecord)` — compose and send the verification email using Alex's voice. Rate limit checks (IP + recipient). |
| `src/engine/network-verify.test.ts` | Create: Tests for uniform response (same result for found/not-found), verification email sent only on found, rate limiting (IP and per-recipient), constant-time behaviour, email voice matching character bible. |
| `src/engine/network-chat-prompt.ts` | Modify: Add `"referred"` context variant for Alex's opening posture (acknowledging, confident). |
| `src/db/schema.ts` | Modify: Add `verifyAttempts` table (id, ipHash, email, createdAt) for rate limiting. Add `verificationEmails` table (id, recipientEmail, sentAt) for per-recipient rate limiting. |
| `src/test-utils.ts` | Modify: Add `verify_attempts` and `verification_emails` tables to `createTables`. |

## User Experience

- **Jobs affected:** Orient ("Is this email real?"), Decide ("Do I respond? Do I want this for myself?")
- **Primitives involved:** None from the 16 workspace primitives — these are pre-workspace pages
- **Process-owner perspective:**
  - **Verify:** Recipient enters email → sees "check your inbox" → finds verification email confirming the outreach was genuine → can reply or explore Ditto. Trust established.
  - **Referred:** Recipient who liked Alex's quality → sees "You've seen how I work" → has a warm conversation with Alex → gives email → becomes a Ditto user. Network effect.
- **Interaction states:**
  - Verify: Loading → form → submitting → uniform result → (optionally) rate limited
  - Referred: Loading → contextual greeting → conversing → email capture → post-submission (same states as Surface 1 + returning visitor + already-a-user detection)
- **Designer input:** `docs/research/web-acquisition-funnel-ux.md` — Surface 2 and Surface 4 fully specified

## Acceptance Criteria

1. [ ] `/verify` page renders Alex's greeting and an email input field. Max-width 480px, centered.
2. [ ] Submitting an email that IS in the outreach database returns the same web page response as submitting one that is NOT. (Verified by comparing HTTP responses byte-for-byte, excluding timing.)
3. [ ] When the email IS found, a verification email is sent to that address using Alex's voice. Email includes: date of outreach, general topic, reply instructions.
4. [ ] When the email is NOT found, no email is sent. The web page response is identical.
5. [ ] Verify endpoint uses a fixed-delay floor of 500ms. Verification email sent asynchronously within the delay window.
6. [ ] Rate limit: 6th verify attempt from the same IP within an hour returns a rate-limited Alex message: "You've checked a few times — if you're not getting a verification email, the original message probably wasn't from me."
7. [ ] Rate limit: 2nd verification email to the same recipient within 24 hours is not sent (silently suppressed, web page response unchanged).
8. [ ] "Tell me more →" CTA on the verify page links to `/welcome/referred`.
9. [ ] `/welcome/referred` page renders Alex's contextual greeting: "You've seen how I work — an introduction that was actually worth your time..."
10. [ ] Referred page shows tailored quick-reply pills: "I run a business", "I'm a connector", "Just curious".
11. [ ] Referred page conversation uses the chat API with `context: "referred"` (Alex's tone is acknowledging/confident per the UX spec).
12. [ ] Email capture and post-submission flow on referred page works identically to the home page (reuses components from Brief 094).
13. [ ] Returning visitor to referred page (email in localStorage) sees: "Hey — you're already in. Check your email for my latest."
14. [ ] If the submitted email matches an existing network user (detected after email capture on referred page), Alex shows: "Turns out we already know each other! Check your inbox — I'll pick up where we left off."
15. [ ] Email footer link template defined: "Sent by Alex from Ditto — AI-powered introductions. Want your own advisor? Learn more → [link to /welcome/referred]". Template available for use by outreach email composition.
16. [ ] Funnel events recorded in `funnelEvents` table (from Brief 093): `verify_requested` (on email submit), `verify_cta_clicked` (on "Tell me more" click), `referred_landed` (on `/welcome/referred` page load).
17. [ ] Verify endpoint uses a fixed-delay floor (500ms minimum response time). Response timing is constant (±50ms) regardless of hit/miss. (Verified by timing 10 found and 10 not-found requests.)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/research/web-acquisition-funnel-ux.md`
2. Review agent checks: Is the anti-enumeration pattern truly uniform (same bytes, same timing)? Does the verification email match Alex's voice? Does the referred page correctly reuse Brief 094 components (no duplication)? Are rate limits adequate? Is the email footer link subtle enough?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Start dev server
pnpm dev

# === Verify page ===

# Open http://localhost:3000/verify
# Expect: Alex greeting + email input

# Submit an email that IS in the outreach database
# Expect: "If that email's from me, I've just sent you a verification..."
# Check inbox: verification email from Alex should arrive

# Submit an email that is NOT in the outreach database
# Expect: SAME response. No email arrives.

# Submit 6 times rapidly from same IP
# Expect: 6th attempt shows rate limit message

# === Referred page ===

# Open http://localhost:3000/welcome/referred
# Expect: Alex's contextual greeting + tailored pills

# Click "I run a business"
# Expect: Message sent, Alex responds in acknowledging/confident tone

# Complete the conversation flow → email capture → post-submission
# Expect: Same post-submission experience as home page

# === Verify the anti-enumeration ===

# Compare responses (should be identical except for timing noise)
curl -s -w "%{time_total}" -X POST http://localhost:3000/api/network/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"known@example.com"}' > /tmp/found.json

curl -s -w "%{time_total}" -X POST http://localhost:3000/api/network/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"unknown@example.com"}' > /tmp/notfound.json

diff /tmp/found.json /tmp/notfound.json
# Expect: identical JSON response bodies
```

## After Completion

1. Update `docs/state.md` with what changed
2. Full acquisition funnel is operational — update `docs/roadmap.md`
3. Phase retrospective: verify anti-enumeration effectiveness, referred page conversion baseline
4. Capture insight if the verify → referred conversion proves to be a significant growth channel
