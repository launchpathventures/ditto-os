# Brief: Ghost Mode — Alex Sends As the User

**Date:** 2026-04-10
**Status:** draft
**Depends on:** Brief 121 (wait_for + gate primitives), Brief 123 (magic link auth for consent surface)
**Unlocks:** Ghost-mode process templates (follow-ups, scheduling, client comms)

## Goal

- **Roadmap phase:** Phase 9: Network Agent Continuous Operation
- **Capabilities:** Ghost sending identity, passive voice model collection, identity-aware email formatting, critical-trust enforcement

## Context

Insight-166 identified three sending identities: `principal` (Alex as himself), `agent-of-user` (Alex on behalf of), and `ghost` (Alex AS the user — no Ditto branding). The infrastructure is ~65% built: identity-router handler resolves `sendingIdentity`, voice-calibration handler loads voice models, outbound-quality-gate validates content, `outbound_actions` table tracks everything. What's missing is the product layer: the cognitive mode that governs ghost judgment, the voice model collection mechanism, the email formatting that strips Ditto branding, and the process templates.

Ghost mode is the highest-trust operation Ditto performs. The user's personal reputation is directly at stake with no Ditto brand buffer. It must always run at critical trust tier and require explicit consent before first ghost send to any new recipient.

## Objective

Alex can send emails that appear to come from the user (no Ditto branding, user's voice, user's name), with the strictest trust tier, passive voice model collection from natural email exchanges, and a cognitive mode that encodes when to refuse.

## Non-Goals

- Sending from the user's actual email domain (requires DNS/DKIM setup — future)
- Voice capture from audio/dictation
- Ghost mode in real-time chat (email only for now)
- Auto-upgrading ghost trust tier (always critical)
- Ghost mode for outbound cold outreach (only for follow-ups, scheduling, and existing relationships)

## Inputs

1. `cognitive/modes/connecting.md` — Reference for mode file structure and judgment framework
2. `cognitive/modes/selling.md` — Reference for escalation triggers and refusal patterns
3. `packages/core/src/harness/handlers/voice-calibration.ts` — Voice model loading infrastructure
4. `packages/core/src/harness/handlers/identity-router.ts` — Identity resolution
5. `src/engine/harness-handlers/memory-assembly.ts` — Mode resolver and cognitive context injection
6. `src/engine/channel.ts` — Email formatting and sending
7. `src/engine/inbound-email.ts` — Where voice model data will be extracted
8. `src/engine/self-tools/network-tools.ts` — Email templates
9. `docs/insights/166-connection-first-commerce-follows.md` — Ghost mode design rationale

## Constraints

- Ghost trust tier is ALWAYS critical. No relaxation. No auto-upgrade. The `trust` section in any ghost process must be `initial_tier: critical` with empty `upgrade_path`.
- First ghost send to a new recipient requires explicit user approval (via trust gate pause)
- After 3+ clean approvals to the same recipient, subsequent sends can be spot-checked (but the process tier stays critical — spot-checking is per-step via `trustOverride`)
- Voice model requires minimum 5 user email samples before ghost mode is available
- Ghost emails must not contain opt-out footers (they "come from" the user, not Ditto)
- Ghost emails must not contain magic link footers (they "come from" the user, not Ditto)
- Ghost emails MUST contain a BCC to the user's email (so they see what was sent)
- No internal tracking headers (no X-Ditto-Ghost or similar — headers are visible to recipients and undermine the feature)
- No ghost mode for cold outreach — only for existing relationships (people the user has interacted with)
- Deliverability: ghost emails send from Ditto's domain with the user's display name. Without the user's DKIM/SPF alignment, some recipients may see "Alex Smith via ditto.partners" in their client. This is acceptable for v1 — full domain delegation is a future enhancement. The BCC to the user ensures they know what was sent regardless of deliverability.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Voice model extraction | Lavender.ai email tone analysis | pattern | Same concept: extract writing style from email corpus |
| Ghost sending identity | Superhuman delegation | pattern | Same UX: AI sends as you, matches your voice |
| Critical trust enforcement | ADR-007 (trust earning) | adopt | Strictest tier already defined, just enforce it |
| Voice calibration handler | `packages/core/src/harness/handlers/voice-calibration.ts` | adopt | Already built, needs product-layer wiring |
| Cognitive mode file | `cognitive/modes/connecting.md` | adopt | Same structure, different judgment framework |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `cognitive/modes/ghost.md` | Create: Ghost mode cognitive extension — strictest judgment, refusal patterns, escalation triggers, silence conditions. "If I wouldn't send this from my own email, I won't send it from yours." |
| `src/engine/harness-handlers/memory-assembly.ts` | Modify: extend mode resolver — step-level `sendingIdentity: "ghost"` loads ghost mode regardless of process operator. Inject voice model into prompt when ghost mode active. |
| `src/engine/inbound-email.ts` | Modify: in `handleUserEmail()`, store the user's raw email text as a `voice_model` memory scoped to the user. V1 is simple: save the full reply text as a sample. The LLM does the style matching at generation time from raw samples — no structured extraction needed. Passive collection — no user action needed. |
| `src/engine/channel.ts` | Modify: in `sendAndRecord()`, when `sendingIdentity === "ghost"`: (1) skip persona sign-off and Ditto branding, (2) use user's name as sender display name, (3) skip opt-out footer, (4) skip referral footer, (5) BCC the user's email address, (6) add `X-Ditto-Ghost: true` header |
| `src/engine/channel.ts` | Modify: in `formatEmailBody()`, add ghost-mode formatting path |
| `processes/templates/ghost-follow-up.yaml` | Create: Ghost mode follow-up process — for existing relationships only. Uses `defaultIdentity: ghost`, `wait_for: reply`, `gate: { engagement: silent }`. Trust: critical, never upgrades. |
| `src/engine/people.ts` | Modify: add `getVoiceModelReadiness(userId): { ready: boolean, sampleCount: number }` — checks if 5+ voice_model memories exist |

## User Experience

- **Jobs affected:** Delegate (ghost mode is the ultimate delegation — Alex acts as you), Review (user sees ghost drafts in trust gate before first send to a new person)
- **Primitives involved:** TrustControl (critical tier, per-recipient approval), Review Queue (ghost drafts surface here)
- **Process-owner perspective:** "Alex, follow up with Sarah for me." Alex drafts in the user's voice, BCC's the user so they see it. First time to a new person, Alex shows the draft and asks. After a few clean sends, Alex can be more autonomous — but always at the highest scrutiny level.
- **Interaction states:**
  - Ghost mode not ready (< 5 samples) → "I need a few more email exchanges with you before I can match your voice. Keep replying to my emails naturally."
  - Ghost draft pending approval → standard trust gate review (same UI as supervised steps)
  - Ghost email sent → BCC arrives in user's inbox within seconds
- **Designer input:** Not invoked — ghost mode surfaces through existing review queue and email

## Acceptance Criteria

1. [ ] `cognitive/modes/ghost.md` exists with: trust (always critical), voice (match exactly, ask when uncertain), refusal patterns, escalation triggers, silence conditions
2. [ ] Mode resolver loads ghost mode when step has `sendingIdentity: "ghost"` regardless of process operator
3. [ ] Voice model is injected into step execution prompt when ghost mode is active: "Write in this person's voice. Here are their recent emails: [raw samples]"
4. [ ] Inbound email processing stores user's raw reply text as `voice_model` memory (simple storage, no structured extraction)
5. [ ] `getVoiceModelReadiness(userId)` returns `{ ready: false, sampleCount: 3 }` when < 5 samples exist
6. [ ] Ghost mode emails have NO Ditto persona sign-off, NO opt-out footer, NO referral footer, NO magic link footer
7. [ ] Ghost mode emails use the user's name as sender display name
8. [ ] Ghost mode emails BCC the user's email address
9. [ ] Ghost mode emails contain NO internal tracking headers (no X-Ditto-Ghost or similar)
10. [ ] Ghost mode process templates have `initial_tier: critical` with empty `upgrade_path`
11. [ ] First ghost send to a new recipient pauses for user approval (trust gate)
12. [ ] Ghost mode is only available for existing relationships (person has prior interactions with user)
13. [ ] Ghost mode refuses cold outreach — returns error if target has no prior interaction
14. [ ] `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Trust model (critical tier enforced, no auto-upgrade), security (BCC to user, no Ditto branding leak, voice model privacy), feedback capture (ghost approvals recorded), Layer alignment (L2 Agent + L3 Harness)
3. Present work + review to human

## Smoke Test

```bash
# Type check
pnpm run type-check

# Voice model extraction test
pnpm vitest run src/engine/inbound-email-voice.test.ts

# Ghost email formatting test
pnpm vitest run src/engine/channel-ghost.test.ts

# Manual: send a test ghost email
# Verify: no Ditto branding, user's name, BCC received, X-Ditto-Ghost header present
```

## After Completion

1. Update `docs/state.md`: "Ghost mode: cognitive extension, voice collection, identity-aware email"
2. Update `docs/architecture.md` Layer 2: ghost sending identity is now operational
3. Write ADR for ghost mode trust model (critical-only, per-recipient approval, BCC requirement)
4. Update Insight-166 with implementation status
5. Retrospective: how many email samples needed for acceptable voice quality? Is 5 enough?
