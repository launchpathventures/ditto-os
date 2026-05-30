# Architecture Review Checklist

Use this checklist to review every piece of work against the Ditto architecture. This is the harness on our own build process.

## How to Use

After producing work for any phase or task, spawn a separate review agent with this checklist and `docs/architecture.md` as context. The review agent produces a PASS/FLAG/FAIL report. Present both the work and the review to the human for decision.

## Checklist

### 1. Layer Alignment
Does this change map to a specific layer in the architecture? Which one(s)?
- Layer 1: Process — definitions, inputs, outputs, quality criteria
- Layer 2: Agent — adapters, roles, heartbeat, budget
- Layer 3: Harness — review patterns, trust tiers, escalation
- Layer 4: Awareness — dependency graph, event propagation
- Layer 5: Learning — feedback, correction patterns, improvements
- Layer 6: Human — CLI/UI, review queues, dashboards
- Cross-cutting: Governance, agent authentication

### 2. Provenance
Is there a source project for this pattern? Is the ADR written?
- Every adopted pattern must cite: project name, file path, what we took
- Every original pattern must be explicitly marked as "original to Ditto"
- If no provenance exists, FLAG it

### 3. Composition Check
Are we building something that already exists in a proven project?
- Check `docs/landscape.md` for evaluated alternatives
- If a proven solution exists and we're building custom, justify why
- The default is to adopt, not invent

### 4. Spec Compliance
Does this match what `docs/architecture.md` says?
- If it deviates, is the spec wrong or is the code wrong?
- If the spec needs updating, flag it — don't silently diverge

### 5. Trust Model
Does this respect trust tiers?
- Does it default to supervised?
- Does it never auto-approve without explicit trust tier configuration?
- Does it never auto-upgrade trust?

### 6. Feedback Capture
Does this change capture data that the learning layer will need?
- Every human decision (approve/edit/reject) must be recorded
- Every harness decision (advance/pause) must be recorded
- Diffs must be captured for edits

### 7. Simplicity
Is this the minimum needed for the current task?
- No features for hypothetical future requirements
- No abstractions for one-time operations
- Three similar lines is better than a premature abstraction

### 8. Roadmap Freshness
Is the roadmap up to date?
- Does `docs/roadmap.md` reflect what we learned?
- Are deferred items still correctly deferred?
- Have re-entry conditions changed?
- Does `docs/state.md` reflect current reality?

### 9. User Experience (ADR-004)
Does this work honour the Designer's input?
- If a Designer interaction spec exists (`docs/research/*-ux.md`), does the brief/implementation address it?
- Is the brief's User Experience section populated (not blank or "N/A" when the work has user-facing impact)?
- Does the work serve the six human jobs it claims to? (Orient, Review, Define, Delegate, Capture, Decide)
- Are interaction states specified for UI-touching work?

### 10. Security (Insight-017)
Does this design address security concerns?
- Are credentials stored securely and scoped per-process/per-agent?
- Are permission boundaries explicit — what can each agent access?
- Is sensitive data exposure minimised (no secrets in logs, no credentials in agent context)?
- Does trust enforcement integrity hold — can an agent bypass its trust tier?
- Are audit trails sufficient for the security-relevant actions introduced?

### 11. Execution Verification (Insight-019)
Has the changed code been run end-to-end, not just type-checked?
- Has the smoke test from the brief been executed?
- Did the output match expectations (not just "no errors")?
- If the brief has no smoke test section, FLAG it — every brief must have one

### 12. Reference Doc Accuracy (Insight-043)
Do the ADRs and architecture.md sections referenced by this work still accurately describe the system?
- Did the producing role include a "Reference docs" line in their output? FLAG if missing
- Are referenced ADRs still consistent with what was built/designed?
- If the work changes architectural scope, was architecture.md updated?
- FLAG any stale reference docs — even if the producing role didn't catch them

### 13. Side-Effect Invocation Guards (Insight-180)
Do new functions that produce external side effects require proof of harness context?
- Any new function that calls external APIs (social publishing, payments, webhooks, email sends) MUST require a `stepRunId` parameter
- The guard must reject calls without `stepRunId` (except in `DITTO_TEST_MODE`)
- FLAG any side-effecting function that is callable without step execution context
- This ensures all external mutations traverse the harness pipeline (trust gates, outbound-quality-gate, audit logging)

### 14. Delegation Guidance Branch Parity (Insight-183)
When changes touch the Self's delegation guidance in `self.ts`, are all three branches updated?
- **New user** branch (full ~800 tokens) — the verbose version
- **Established user** branch (compact ~150 tokens) — must include a compressed equivalent
- **Inbound** branch (async email/voice) — update if the instruction applies to async flows; skip if UI-only
- FLAG if a behavioral instruction appears in one branch but not the others where it's relevant

### 15. Landscape Coverage
Do all external dependencies referenced by this work have evaluations in `docs/landscape.md`?
- Any new external API, SDK, or service used in the implementation must have a landscape entry
- FLAG if an external dependency was introduced without a landscape evaluation
- The Researcher or Architect should have written the evaluation during design — if the Documenter has to add it, that's a process gap

### 16. Cross-Deployment Delivery Durability (Insight-234)
Do Network-originated artifacts that must appear inside a workspace have a durable delivery contract?
- Require sender-side persistence for any Network → workspace inbox/review artifact; in-memory SSE or live event fanout is not sufficient across deployments
- Require consumer-side local import so workspace rendering and actions do not depend on a live Network DB read
- Require idempotent ACK retry: already-imported rows still need to ACK their source delivery ids
- Require terminal-state persistence for imported review artifacts so approve/reject outcomes survive reloads

### 17. Network Superconnector Safety Gates
When work touches Member Signals, Active Requests, manual search, background watch, discovery, claim invites, share loops, or introductions, are the superconnector gates explicit and tested?
- Economic outcome: does the work optimize for concrete professional/economic outcomes rather than volume, vanity networking, or generic growth?
- Provenance: does every claim, request inference, match rationale, and invite reason cite source labels/ids?
- Privacy scrub: do public/search/share/email/watch surfaces prove private/on-request/hidden data cannot leak?
- Source policy: are LinkedIn/public-web/source-registry rules enforced in code before collection, storage, or invite use?
- LinkedIn posture: no unauthorized scraping, no fake accounts, no browser/cookie/session automation, no People Search automation without formal access, and no LinkedIn profile content stored as claims without consent/formal access.
- Claim-before-public: do Discovery Profiles remain internal until the discovered person claims/approves?
- No-contact background watch: can watches propose/digest without contacting a third party?
- Two-sided intro consent: requester approval before asking recipient; recipient approval before shared thread.
- Outbound email compliance: suppression, opt-out, sender identity, complaint handling, and misleading-subject checks for claim invites and intro emails.
- Side-effect matrix: does every route/tool that writes, sends, searches, starts jobs, deletes/exports, or invokes LLM/external APIs require `stepRunId` or a wrapper step run and reject caller-supplied `stepRunId`, including falsy values?

### 18. Boundary Enforced by Transport, Not Runtime Filter (Insight-235)
When the work asserts or relies on a capability/security boundary, is the boundary checked at its real enforcement seam — not a plausible-sounding proxy?
- Does any acceptance criterion claiming a safety boundary name the **enforcement seam** (which engine/endpoint/route the surface is wired to) and exercise that seam or the routing invariant — not just a table-consistency unit test?
- If a privileged path passes the full toolset without consulting the boundary table (e.g. `selfConverseStream()` not calling `filterToolsForContext()`), is there a comment at that exact site stating the guarantee is transport-level and pointing to where the boundary *is* enforced?
- Did the reviewer trace from the surface to the actual decision point and verify the path under review reaches it — rather than confirming a table merely exists?
- FLAG any "fix" that adds a redundant runtime filter on a path that is safe by construction (it obscures the real invariant).

### 19. Fan-Out Helper Cross-Cutting Filter Uniformity (Insight-236)
When a helper fans out across heterogeneous kinds and accepts a filter that applies to some-but-not-all of them, is the filter resolved once and applied uniformly?
- Is the cross-cutting filter resolved **exactly once** into a single typed object and threaded into every collector — never re-derived per kind?
- Unresolved → empty: does an unresolvable filter short-circuit to nothing (never an unscoped fallback)?
- Unscopable kinds omitted: are kinds the filter cannot scope explicitly omitted (and their count zeroed), not silently returned unfiltered?
- Indirect ownership: does the resolved object carry enough to apply the filter through indirect paths (e.g. a memory's project via its process scope / `appliedProjectIds`)?
- Do tests include a **cross-kind filtered case**, not only per-kind cases? (The leak is invisible to single-kind tests.)

### 20. Member Signal Provenance — Network Trust Gate (Brief 278 D-Q7)
Every Member Signal claim, Possible Connection match rationale, request inference, and invite reason carries an inspectable source label/id?
- **Verify:** every public-facing claim/match/invite-reason links to a `network_signal_sources` row, KB fact, scout result, or member-approved statement the owner can open; agent-generated text without a source label is a FAIL. The umbrella check in item #17 names this gate; this item is the durable boolean.

### 21. Private-Leakage Scrub Coverage — Network Trust Gate (Brief 278 D-Q7)
Every Network surface that renders to a non-owner — public profile, share, search results, proposal email, intro email, watch digest, claim invite, admin preview — passes `network-privacy-scrubber.ts` and proves private/on-request/hidden data cannot leak?
- **Verify:** focused vitest covers the eight-surface × four-visibility matrix; `NetworkProfileCardBlock.antiPersonaMd` is `null` on every non-owner render (Hard Rule #5 enforced at the block, not only the scrubber); admin reveal of raw text writes its own `network_audit_events` row.

### 22. No-Contact Background Watch — Network Trust Gate (Brief 278 D-Q7)
Background watches can sense, score, and digest without contacting any third party?
- **Verify:** every background-watch runtime tool/step's output is digest/propose/queue only; outbound contact requires a downstream `compose_intro` or `send_claim_invite` step gated on operator/recipient consent and `network-email-compliance.ts`; tests assert no email/DM/webhook side effect inside the watch loop itself.

### 23. Two-Sided Intro Consent — Network Trust Gate (Brief 278 D-Q7)
Every Introduction Proposal requires requester approval before the recipient is asked, and recipient approval before a shared thread opens?
- **Verify:** the `introductions` row carries both `requesterApprovedAt` and `recipientApprovedAt` (or equivalent two-stage approval state) before any email/thread side effect; `AuthorizationRequestBlock` gates both halves; tests cover the asymmetric-decline case (either side declines → no thread).

### 24. Claim-Before-Public Discovery — Network Trust Gate (Brief 278 D-Q7)
Discovery Profiles remain internal until the discovered person claims/approves?
- **Verify:** `network_discovered_profiles` is internal-only until a `network_claim_tokens` redemption resolves to `claimed`; the public profile route returns 410/404 for unclaimed Discovery Profiles; OG/share/search/email surfaces never render unclaimed Discovery Profile content.

### 25. Outbound-Email Suppression and Compliance — Network Trust Gate (Brief 278 D-Q7)
Every claim invite and intro-related email passes suppression check, sender identity, RFC 8058 one-click unsubscribe, configured CAN-SPAM footer, and a misleading-subject check before send?
- **Verify:** `network-email-compliance.ts` is called by every send path; a `network-suppression.ts` hit writes an audited refusal row (not a silent drop); `List-Unsubscribe` (mailto+https) + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers are present on every send through the `AgentMailAdapter` `headers` pass-through; complaint webhook (`/api/v1/network/complaints`) feeds suppression and pause.

### 26. Source-Policy Enforcement Before Store/Outreach — Network Trust Gate (Brief 278 D-Q7)
Discovery and outbound paths enforce source policy in code before any collect/store/invite-use write?
- **Verify:** `discovery-source-policy.ts` gates are called at the three enforcement points (collect, store, invite-use); a disallowed source class writes an audited block row and refuses the write; LinkedIn ingestion beyond URL pointer / user-provided / consented / formal-API data is blocked in code, not in documentation.
