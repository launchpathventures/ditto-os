# Brief 268: Managed-Workspace First-Run Onboarding — Conversational Bootstrap → LLM Pick → Seed → First Process

**Date:** 2026-05-13
**Status:** draft
**Depends on:**
- Brief 212 (complete) — `ditto-bridge` device pairing + JWT issuance + WebSocket dispatch. This brief consumes the existing pair flow for the local-bridge LLM path; it does not modify the bridge protocol.
- Brief 269 (draft) — Bridge distribution: one-line `curl | sh` installer, self-contained binaries for macOS + Linux, hosted at `ditto.partners/install`. The bridge path in this brief's UX hands the user a single copy-paste command produced per Brief 269. Without 269, the bridge path in onboarding is functionally broken for any user who isn't a Ditto monorepo developer. Briefs 268 and 269 can develop in parallel — 268 stubs the install endpoint until 269 lands.
- Brief 057 (complete) — `/setup` wizard, `data/config.json` persistence, `DittoConfig` discriminated union, `applyConfigToEnv`. This brief EXTENDS `DittoConfig` with two new connection methods and adds a conversational onboarding shell — it does not replace the wizard for self-hosted users.
- Brief 267 (complete) — Provisioner auto-env + `NEXT_PUBLIC_APP_URL` injection. This brief assumes the provisioner-set env vars are reliable (see Insight-234) so the bootstrap Self can trust `DITTO_DEPLOYMENT === "workspace"` to decide it is in managed mode.
- Brief 088 (complete) — Network ↔ workspace auth (`DITTO_NETWORK_TOKEN`, `network_tokens` table). The metered-key path issues `ditto-network-llm` tokens via this same auth surface.
- Brief 143 (complete) — Workspace magic-link / session cookie. This brief assumes the user is already logged in via `ditto_workspace_session` when onboarding runs.
- Insight-231 (active) — Cross-deployment auth artifacts must validate in the consuming deployment. The metered-key token, once issued by Network, must validate inside the workspace without a per-LLM-call round-trip to Network.

**Unlocks:**
- Brief 261 (draft) — workspace upsell copy fires *after* the user is onboarded; this brief is the prerequisite that defines "onboarded."
- Future brief: metered-key billing surface (usage caps, per-workspace dashboards, throttling) — v1 of this brief enforces a hard monthly cap but does not surface billing UX.
- Future brief: shared-team workspaces — this brief assumes single-owner workspaces; multi-user onboarding is a separate problem.

## Goal

- **Roadmap phase:** Phase 16 — Productization / Managed Workspace UX
- **Capabilities:** Land the first-run onboarding experience for managed workspaces. A freshly-provisioned workspace user who clicks their bootstrap login URL lands in a conversational onboarding flow (not the empty inbox) that walks them through two decisions and one elicitation:
  1. **LLM connection choice** — metered Ditto Network LLM key (issued instantly, capped usage, no user signup with a model provider) OR local-bridge pairing (user runs `ditto-bridge pair` on their machine, all LLM calls route through their existing Claude / OpenAI / Codex subscription).
  2. **Seed elicitation** — once LLM is live, the Greeter (real LLM-backed) asks 3 questions in conversation: what's your business, what are your goals/objectives, what's the first problem you want solved.
  3. **First process scaffold** — Greeter proposes a concrete first process (name, trigger, primary action) grounded in the seed answers; user accepts/refines; process YAML is written; onboarding exits.

The exit criterion is **not** "configured." It is "the Greeter has enough seed information that we can build a first agent (process) that fulfills on the user's first problem." This is the design move that distinguishes Ditto from "API key wizard then empty product" SaaS onboarding: the onboarding doesn't end with you in the product — it ends with the product about to do something useful for you.

## Context

Three converging signals make this the next work after the hotfix cycle (PR #52 + PR #53):

1. **The gap is now demonstrated.** Tim logged in to the freshly-provisioned launchpath workspace and observed: no LLM connected, no setup walk-through, no signal of what to do next. Diagnosis: 24 env vars set by the provisioner, zero LLM provider keys; `/setup` wizard exists but only `process/[id]/page.tsx` redirects to it; the wizard itself is shaped for self-hosted (shells out to `which claude`) and ignores managed mode. The provisioner closed the *infra* gap; the *UX* gap is the next layer. Without this brief, every newly-provisioned managed workspace silently fails its first-run.

2. **The architecture already wants conversational onboarding.** CLAUDE.md Principle 4: "Process is the primitive." CLAUDE.md Principle 5: "The harness is the product." A wizard-shaped onboarding is the bolted-on shape that contradicts both principles. A *bootstrap Self* — a deterministic, no-LLM-required conversational shell that hands off to the real LLM-backed Self once the LLM is wired — is the shape that aligns. It also creates a reusable pattern: any time the LLM is unreachable (revoked key, billing failure, network outage, model deprecated), the bootstrap Self can take over and walk the user back to a working state. We get the recovery story for free.

3. **The two LLM paths are first-class product positioning, not a config detail.** The metered-network-key path is the friction-free "I just want to try this" path — Ditto issues a token, the user is in the conversation in under a minute, usage is capped so launchpath isn't exposed to runaway cost. The local-bridge path is the "I already pay Anthropic / OpenAI / etc., let me use my own subscription" path — no double-billing, the user keeps their existing context, and Ditto's cost-of-goods is zero. Forcing every user down the same path closes off one of those segments. Surfacing both, side by side, at first run is how we let the user self-select into the segment that fits.

## Design — the conversational shape

### Surface A — Landing redirect

After magic-link auth, `app/page.tsx` (workspace root) runs an `isOnboarded()` check.

```ts
function isOnboarded(): boolean {
  if (process.env.DITTO_DEPLOYMENT !== "workspace") return true;  // self-hosted: untouched
  if (process.env.MOCK_LLM === "true") return true;                // test mode: skip
  const config = loadConfig();                                     // data/config.json
  if (!config) return false;                                       // no LLM wired
  const onboardingState = loadOnboardingState();                   // data/onboarding.json
  return onboardingState?.completedAt != null;                     // explicit completion
}
```

If `false`, `redirect("/onboarding")`. Existing users (config + completion marker present) skip the check at the layout level and go straight to inbox.

`/onboarding` is added to `BASE_PUBLIC_PREFIXES` only if `ditto_workspace_session` cookie is present — it is auth-gated, but it lives outside the workspace shell layout (no sidebar, no inbox chrome) so the user is in a focused conversation, not a half-rendered product.

### Surface B — Bootstrap Self conversation

The `/onboarding` route renders a chat-like surface (reuses `<Conversation>` from `packages/web/components/self/conversation.tsx`). The conversation is driven by a **bootstrap Self** that runs entirely in a server action — no LLM calls. State machine:

```
STATE: greet
  → "Hi, I'm your Ditto. Before I can think for you, I need to be connected
     to an LLM. You've got two options."
  → render: <LlmPathPicker />

STATE: pick_llm
  → user selects "metered" or "bridge"
  → branches:
     - metered → STATE: metered_issue
     - bridge  → STATE: bridge_pair

STATE: metered_issue
  → server action: POST /api/v1/onboarding/issue-metered-key
    → calls Network: POST /api/v1/network/llm-tokens with workspace-scope
    → Network returns { token: "dnt_lmk_...", monthlyCapUsd: <n>, expiresAt }
    → write data/config.json: { connection: "ditto-network-metered", model: <default>, apiKey: <token>, monthlyCapUsd, expiresAt }
    → live-test the token: 1 Anthropic /v1/messages ping with 10-token max
    → on success: "You're connected. Usage is capped at $X/month — I'll
       tell you when you're approaching the cap. Now let's talk about what
       you do."
    → STATE: seed_business
  → on failure: surface error, allow retry or switch path

STATE: bridge_pair (guided install + pair in ONE command)
  → server action: POST /api/v1/onboarding/start-bridge-pair
    → detects user OS from User-Agent + Sec-CH-UA-Platform header
    → if Windows: render "Bridge isn't packaged for Windows yet — pick the
       metered option above, or follow ditto.partners/install/manual."
       Offer one-tap switch back to STATE: pick_llm.
    → if macOS or Linux:
       → generates 6-char pair code (15-min TTL, single-use) — Brief 212
       → returns {
           pairCode,
           workspaceUrl,
           os: "macos" | "linux",
           arch: "x64" | "arm64",
           installCommand: "curl -fsSL https://ditto.partners/install | DITTO_PAIR=ABC123 DITTO_WS=https://workspace.example.com sh",
           manualUrl: "https://ditto.partners/install/manual"
         }
    → render: ONE big copy-button command box (per Brief 269's contract).
       The command, when pasted into a terminal, installs the bridge
       daemon, pairs it with the workspace, and starts it — all in one
       motion. The user never types a second command.

  → render below the command box:
     - "Already installed?" link → re-uses existing daemon, just pairs.
       Resolves to: ditto-bridge pair ABC123 https://workspace.example.com
     - "Don't trust curl|sh?" link → opens ditto.partners/install/manual
       in a new tab (Brief 269 Artifact C).
     - Live polling indicator with stages:
         "Waiting for the bridge to install..."
         → "Bridge installed — waiting for pair..."
         → "Paired — running a quick test..."
         → "Connected."

  → workspace polls GET /api/v1/onboarding/bridge-status every 2s
    → returns { stage: "waiting" } until the bridge daemon contacts the
       workspace at all (first WebSocket connect attempt)
    → returns { stage: "installed", deviceFingerprint } when the daemon
       has dialed in but hasn't completed pair handshake
    → returns { stage: "paired", deviceId, capabilities } when pair
       handshake completes
    → returns { stage: "failed", reason } on any terminal error

  → on stage: paired:
    → write data/config.json: { connection: "local-bridge", bridgeDeviceId, model: <from capabilities> }
    → live-test: dispatch a tiny "say hello" job over the bridge, expect a non-empty reply within 30s
    → on success: "Connected. Every LLM call from now on routes through
       your machine — no double-billing, no token caps from me. Now let's
       talk about what you do."
    → STATE: seed_business

  → on stage: failed (or no progress for 5 min):
    → surface specific error (install failed, checksum mismatch, pair
       handshake rejected, etc.)
    → offer: "Retry" (regenerates pair code, same command shape) /
       "Switch to metered" (back to pick_llm)

STATE: seed_business (LLM is now live — bootstrap Self hands off to Greeter)
  → Greeter asks: "What's your business — what do you do, and for whom?"
  → user responds in free text
  → Greeter writes a `user_business` memory (knowledge synthesis primitive)
  → STATE: seed_goals

STATE: seed_goals
  → Greeter asks: "What are your goals over the next 90 days?"
  → free text → `user_goals` memory
  → STATE: seed_first_problem

STATE: seed_first_problem
  → Greeter asks: "What's the first concrete problem you'd want me to help with?"
  → free text → `user_first_problem` memory
  → STATE: propose_process

STATE: propose_process (Greeter, LLM-backed)
  → Greeter calls existing `build-on-gap` system agent with the seed memories
  → build-on-gap proposes: { name, trigger, primary_action, expected_output }
  → render the proposal as a structured card with [Accept / Refine / Skip]
  → on Accept:
    → process YAML written to processes/<slug>.yml (or wherever scaffolding lands)
    → write data/onboarding.json: { completedAt: <iso>, firstProcessSlug: <slug> }
    → STATE: done
  → on Refine:
    → user types refinement, Greeter re-proposes, loop
  → on Skip:
    → write data/onboarding.json with completedAt but no firstProcessSlug
    → STATE: done

STATE: done
  → "You're set. Here's your inbox — your first process is queued."
  → redirect to /
```

### Surface C — Resume durability

Onboarding state machine progress is persisted to `data/onboarding.json` after every transition. If the user closes the tab at STATE: seed_goals and reopens later, they land back at STATE: seed_goals with their `user_business` memory already saved. The bootstrap Self resumes mid-flow rather than restarting.

### Surface D — Skip / escape hatches

Two explicit exits, both rare but necessary:

1. **"Skip onboarding"** link at the top of every state — surfaces a confirmation modal: "You'll land in an empty workspace and have to wire your LLM via the admin page. Continue?" Writes `data/onboarding.json` with `completedAt` and `skippedAt`. Greeter will pick up where it left off when the user next opens chat (the seed memories are still empty, so first real chat will start with "Hey, before we dig in, mind if I ask three quick things about your business?").

2. **"Switch LLM path"** — if metered_issue or bridge_pair is hung, the user can bail back to pick_llm and try the other. Important for cases where the bridge daemon won't install, or the Network is unreachable.

## Design — what lives where (file map)

```
packages/web/lib/config-types.ts
  + new ConnectionMethod variants: "ditto-network-metered" | "local-bridge"
  + DittoConfig discriminated union extension
  + new OnboardingState type

packages/web/lib/config.ts
  + loadOnboardingState() / saveOnboardingState()
  + isOnboarded() helper

packages/web/app/page.tsx
  + add isOnboarded() check; redirect("/onboarding") when false in managed mode

packages/web/middleware.ts
  + add "/onboarding" to BASE_PUBLIC_PREFIXES (auth still required via cookie check)

packages/web/app/onboarding/page.tsx                 (NEW)
packages/web/app/onboarding/onboarding-shell.tsx     (NEW — client conversational UI)
packages/web/app/onboarding/llm-path-picker.tsx      (NEW — two-card chooser)
packages/web/app/onboarding/bridge-pair-card.tsx     (NEW — code + polling)
packages/web/app/onboarding/seed-question.tsx        (NEW — input cards)
packages/web/app/onboarding/process-proposal-card.tsx (NEW — Accept/Refine/Skip)
packages/web/app/onboarding/actions.ts               (NEW — server actions)

packages/web/app/api/v1/onboarding/issue-metered-key/route.ts  (NEW)
packages/web/app/api/v1/onboarding/start-bridge-pair/route.ts  (NEW)
packages/web/app/api/v1/onboarding/bridge-status/route.ts      (NEW)

src/engine/bootstrap-self.ts                         (NEW — deterministic state machine)
src/engine/bootstrap-self.test.ts                    (NEW)

src/engine/network-llm-token.ts                      (NEW — token issuance + validation)
src/engine/network-llm-token.test.ts                 (NEW)

# Network side (separate deployment — landed in same PR or a paired PR):
packages/web/app/api/v1/network/llm-tokens/route.ts  (NEW — Network issues tokens)
packages/core/src/db/network/schema.ts               (EXTEND — networkLlmTokens table)
drizzle/network/00XX_create_network_llm_tokens.sql   (NEW)

src/engine/llm-providers/metered-anthropic.ts        (NEW — Anthropic wrapper that
  reports usage back to Network for metering and enforces local cap)
```

## Constraints

1. **Self-hosted is not regressed.** All onboarding logic is gated on `DITTO_DEPLOYMENT === "workspace"`. A self-hosted developer running `pnpm dev` sees zero behavior change — the existing `/setup` wizard at `process/[id]/page.tsx` still works.

2. **No LLM call from the bootstrap Self.** STATES greet → metered_issue / bridge_pair are 100% deterministic. The only LLM call before STATE: seed_business is the live-test ping that validates the wire (10 tokens max, single call). If that ping fails, no charge has been incurred and the user is back at pick_llm.

3. **Live-test before claiming success.** Both LLM paths must prove the wire works end-to-end *before* the conversation advances. A metered token that 401s, a bridge that pairs but can't dispatch — both must keep the user in the connect state, not drop them into seed elicitation only to have it fail on first turn.

4. **Single LLM call per Greeter turn (Insight-180).** Seed-question turns and the process proposal call must carry `stepRunId`. Existing pattern — no new infrastructure, but must not be skipped.

5. **Cross-deployment validation (Insight-231).** The metered-key token must be self-validating in the workspace (signed JWT-style, payload includes `workspaceId`, `monthlyCapUsd`, `expiresAt`, signed by Network's `NETWORK_AUTH_SECRET`). No per-LLM-call round-trip to Network for validation. Network sees only periodic usage reports (every N requests or N minutes), not per-call auth.

6. **Hard metered cap.** The Anthropic wrapper enforces the cap locally (sum of usage charges over the calendar month) and refuses to dispatch when over. User sees: "You've hit your $X cap for this month. Connect your own LLM via the bridge, or wait until next month's reset." No silent over-spending.

7. **Bootstrap Self never claims to be the real Self.** Copy is deliberately mechanical: "I'm a bootstrap shell" / "I can't think yet" / "Once you connect an LLM, the real me takes over." Avoid uncanny-valley risk of the user mistaking the scripted shell for the LLM-backed Self.

8. **Resume must work.** Any state transition writes `data/onboarding.json`. Refresh / close tab / 30-minute later return → user lands on the exact state they left, with prior answers preserved.

9. **Two flow exits, never more.** Skip onboarding (rare) and switch LLM path (recovery). No "back" buttons within state — confuses the state machine and the user.

10. **OS coverage matches Brief 269.** Bridge path is offered to macOS (14+) and Linux (x64/arm64) users. Windows users are routed to metered with a clear, friendly message (NOT an error). OS detection uses User-Agent + Sec-CH-UA-Platform with conservative defaults (unknown → treat as Linux, since that's the broader baseline).

11. **Install command must be the dead-easy path, not an option among many.** The primary visual element in STATE: bridge_pair is ONE copy-button command. "Already installed?" and "Don't trust curl|sh?" links are secondary and visually subordinate. Goal: 95% of bridge-path users paste exactly one line and never read the secondary links.

## Acceptance criteria

- **AC1 — Landing.** Freshly-provisioned managed workspace user with no `data/config.json` and no `data/onboarding.json`, after magic-link auth, is redirected to `/onboarding` from `/`. An onboarded user (config + completion marker) is not redirected.

- **AC2 — LLM path choice rendered.** STATE: greet → STATE: pick_llm renders both options side by side with copy that names the tradeoff: "Metered (capped usage, no signup needed) | Bridge (use your own Claude/OpenAI subscription)."

- **AC3 — Metered issuance.** Selecting metered calls `POST /api/v1/onboarding/issue-metered-key`, which calls Network and writes `data/config.json` with `{ connection: "ditto-network-metered", apiKey: "dnt_lmk_..." }`. The token is JWT-style, signed by `NETWORK_AUTH_SECRET`, with payload `{ workspaceId, monthlyCapUsd, exp, iat, jti }`. A 10-token Anthropic `/v1/messages` ping returns 200 before the conversation advances.

- **AC4 — Bridge guided install + pair (one command).** Selecting bridge calls `POST /api/v1/onboarding/start-bridge-pair`, which detects the user's OS + arch and returns a single copy-paste install command of the form `curl -fsSL https://ditto.partners/install | DITTO_PAIR=ABC123 DITTO_WS=https://workspace.example.com sh`. The user pastes the command into their terminal once. The bridge daemon installs (per Brief 269), pairs, and starts — no second command typed. The UI shows live progress through stages: waiting → installed → paired → connected. On `stage: paired`, a tiny dispatch test returns a non-empty reply within 30s and `data/config.json` is written with `{ connection: "local-bridge", bridgeDeviceId }`. On `stage: failed` or no progress after 5 minutes, the user can retry or switch to metered.

- **AC4a — Windows users routed away from bridge path.** If the user-agent detection identifies Windows, `POST /api/v1/onboarding/start-bridge-pair` returns a clear "not yet supported on Windows" response with a one-tap "switch to metered" action. No pair code is issued (no wasted single-use code).

- **AC4b — "Already installed?" escape hatch.** For users who already have ditto-bridge installed (re-onboarding, second workspace, etc.), the bridge state surfaces an "Already installed?" link that swaps the curl|sh command for the bare `ditto-bridge pair <code> <url>` command. Same polling, same downstream flow — just skips the install step.

- **AC5 — Live-test gates progression.** If the metered ping 401s or the bridge dispatch test fails / times out, the conversation does NOT advance to STATE: seed_business. User sees a specific error and can retry or switch path.

- **AC6 — Three seed questions.** Greeter asks business, goals, first problem in that order. Each answer is persisted as a memory (`user_business`, `user_goals`, `user_first_problem`) before the next question is rendered.

- **AC7 — First process proposal.** After seed_first_problem, Greeter calls `build-on-gap` with the three seed memories. Proposal renders as a structured card with name, trigger, primary action, expected output, and [Accept / Refine / Skip] actions. On Accept, a process YAML is written to the processes location and `data/onboarding.json.completedAt` is set.

- **AC8 — Resume.** Mid-onboarding (any state), close the tab and reopen. User lands at the same state, with all prior answers / selections preserved.

- **AC9 — Skip path.** Skip writes `data/onboarding.json` with `completedAt` and `skippedAt`. User lands at `/` and is not redirected back. First real chat with the (now LLM-backed) Self begins with a soft seed-elicitation: "Mind if I ask three quick things about your business?"

- **AC10 — Cap enforcement.** Metered-Anthropic wrapper sums usage charges in `data/usage.json` (per-month bucket). When `sum >= monthlyCapUsd`, dispatch returns a 402-equivalent error and Self surfaces: "You've hit your $X cap for this month — switch to bridge or wait until next month."

- **AC11 — Self-hosted untouched.** With `DITTO_DEPLOYMENT` unset or `="self-hosted"`, `/page.tsx` does not redirect to `/onboarding`. Existing `/setup` wizard behavior is unchanged.

- **AC12 — Bootstrap Self has no LLM dependency.** A unit test runs the bootstrap state machine from STATE: greet through STATE: metered_issue (or bridge_pair) with a mocked Network client and mocked Anthropic ping — no actual LLM client is instantiated until STATE: seed_business.

## Open design questions (for the Designer pass during build)

1. **Tone of the bootstrap Self.** Mechanical-explicit ("I'm a script") vs. friendly-but-honest ("Before I can think...") vs. dry-formal ("System: awaiting LLM configuration"). The brief locks "honest about being scripted"; the Designer picks the voice.

2. **Side-by-side cards vs. progressive disclosure for LLM path pick.** Both options visible at once is the brief's stake. Designer decides icons, copy length, what's above-the-fold.

3. **What the live-test message says.** "Testing your key... (3s avg)" with a spinner? A typewriter-style "Pinging Anthropic ✓"? Designer's call — but it must be specific enough that a failed test is debuggable from the UI alone.

4. **First-process proposal card layout.** The proposal is the *moment* — the conversation has been building to it. How do we render it so it feels like a gift, not a form? Designer's call.

5. **Refinement loop UX.** When the user says "no, make it more like X," does Greeter re-render the same card with a diff, or a fresh card with the previous greyed out? Designer picks.

6. **Bridge "I changed my mind" copy.** Mid-pair, if the user wants to switch to metered, the experience must be friction-free. Designer writes the exact copy and the transition animation.

7. **Install command presentation.** The copy-paste command is long (~150 chars including the workspace URL). Should it wrap visually, scroll horizontally, or render as a multi-line `\` -continuation? The terminal cares about one line; the human cares about reading it. Designer picks. Constraint: clicking the command (anywhere) copies the FULL one-line version to clipboard regardless of how it's displayed.

8. **Progress copy during install + pair.** Stages are "waiting → installed → paired → connected." The transitions are typically 5-30 seconds each. Designer writes the in-between copy: encouragement, expectations ("This usually takes about 30 seconds"), or silence + spinner?

## Out of scope (explicitly deferred)

- **Per-workspace billing dashboard / Stripe integration.** v1 enforces the cap; surfacing usage live is the next brief.
- **Multi-user shared workspaces.** This brief assumes single-owner.
- **Email-send configuration (Postmark, SendGrid, etc.).** Greeter can ask later, on the first turn where it actually needs to send email out-of-network.
- **Profile-photo / display-name elicitation.** Not load-bearing for the first process. Greeter can ask in the second or third conversation.
- **Metered model selection.** v1 ships with a single default model (Claude Sonnet) on the metered path. Model picker is a v2 enhancement.
- **Windows support for the bridge path.** Matches Brief 269 (and the daemon's existing platform stance). Windows users on a managed workspace use the metered path; full Windows support for the bridge is a separate brief.
- **Custom install scripts per workspace.** White-labelled installers (e.g. `curl https://acme.partners/install | sh` for an Acme-branded Ditto deployment) are a v2 enhancement once the base installer is stable.
- **Greeter recovery when LLM goes down post-onboarding.** Bootstrap Self CAN serve this case (architecture supports it), but the recovery UX is a separate brief.

## Inputs (read before implementing)

- `docs/briefs/complete/212-workspace-local-bridge.md` — bridge pair flow, device JWT, WebSocket dispatch
- `docs/briefs/269-bridge-distribution-one-line-install.md` — the installer contract this brief depends on (install command shape, supported platforms, telemetry stance)
- `docs/briefs/complete/057-onboarding.md` — existing `/setup` wizard, `DittoConfig`, `applyConfigToEnv` (whichever brief shipped the wizard — verify before referencing)
- `docs/briefs/complete/267-provisioner-auto-env-and-hardening.md` — what the provisioner sets in managed mode
- `docs/insights/180-llm-calling-self-tools-need-step-run-id.md`
- `docs/insights/231-cross-deployment-auth-artifacts.md`
- `docs/insights/234-cross-deployment-inbox-delivery-needs-durable-pull-ack.md` — same family of cross-deployment hostname coupling
- `packages/web/lib/config.ts` + `packages/web/lib/config-types.ts` — current discriminated union
- `packages/web/app/setup/setup-wizard.tsx` — existing state-machine UX to NOT replicate (this is the contrast example)
- `packages/bridge-cli/README.md` — pair flow contract
- `src/engine/system-agents/build-on-gap.ts` — process proposal primitive

## Output

- Code per the file map in "Design — what lives where"
- `data/config.json` schema documented in `lib/config-types.ts` JSDoc
- `data/onboarding.json` schema documented in same
- Migration for `networkLlmTokens` table (Drizzle, both SQL + snapshot, idx checked per Insight-190)
- Unit tests per AC12 + per state transition
- Integration smoke: a Playwright (or curl-script) flow from cold-start to "first process scaffolded"
- Update `docs/architecture.md` §6 ("public surfaces the provisioner depends on") to add `/onboarding` to the managed-workspace surface list
- Update `docs/landscape.md` if metered-Anthropic introduces a new dependency (e.g. a usage-tracking library) — note Insight-043

## Review process

- **Builder smoke test** before handoff to Reviewer: provision a fresh managed workspace (or reuse launchpath in a sandbox env), magic-link in, take each path through to STATE: done. Capture HAR / video proof.
- **Reviewer (fresh context):** challenge against 12-point checklist + the constraints above + Insight-180 + Insight-231 + Insight-234. Specifically verify: (a) bootstrap Self has no LLM dependency (AC12); (b) live-test gates progression (AC5); (c) cap enforcement is local, not Network-round-trip (AC10); (d) resume durability (AC8).
- **Human approval:** Tim signs off on the UX (this is product positioning, not just infra) before the brief is moved to `docs/briefs/complete/`.
