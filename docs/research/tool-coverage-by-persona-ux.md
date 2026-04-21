# Tool Coverage by Persona — UX Interaction Spec

**Date:** 2026-04-21
**Designer:** Dev Designer (thg)
**Status:** draft — pending review
**Trigger:** User requested a persona-grounded coverage matrix alongside the Researcher's `tool-surface-landscape.md`. Brief 208 (Slack + messaging tool-surface gap) exposed that surface extensions are being evaluated without a persona lens — "does this tool shape match how Rob actually works?" is a missing question.
**Companion report:** `docs/research/tool-surface-landscape.md` (Researcher — factual tool inventory)

---

## How to read this document

The Researcher's inventory asks *"what tools exist?"* This spec asks *"given how Rob, Lisa, Jordan, and Nadia actually work, can Self get each of their top-3 Jobs-To-Be-Done done with the tool surface that exists today?"*

**Coverage** is defined in three shades:
- ✅ **Covered** — Self can dispatch tools that accomplish the JTBD, and the tool shape fits the persona's device context and trust posture.
- ⚠️ **Present but mis-shaped** — The tool exists, but it's on the wrong surface for this persona, or it requires a device context they don't have, or the output renders somewhere they can't see it.
- ❌ **Absent** — No current tool (on any surface) accomplishes this JTBD; Self would have to punt to the user's own tooling.

**The user never sees tool names.** The interface is conversation; Self dispatches tools in the background. Coverage is ultimately about *can Self finish this job on behalf of this persona, in this persona's context* — not about whether a tool with a given name exists.

## Primary design lens

`docs/personas.md:258–264` lists **seven motivational JTBDs** (shared across personas) mapped to the **six interaction jobs** (Orient, Review, Define, Delegate, Capture, Decide — `docs/human-layer.md:20–28`). These two columns are not the same dimension: the motivational column is *why* users do things; the interaction column is *which UI surface delivers the affordance*. This spec uses the interaction-jobs vocabulary as its coverage axis — if a JTBD doesn't resolve to an interaction job, it's a design gap before it's a tool gap.

**About the per-persona top-3:** `personas.md` does not enumerate top-3 JTBDs per persona explicitly. The top-3 below are **Designer inferences** drawn from each persona's "What X says" quotes, "core problem" lines, and "first process start" + "month-2" scenarios in `docs/personas.md:80–196`. Where a JTBD is presented as a quote, it is quoted from `personas.md`; where it is presented as an italicised theme, it is scenario-derived (not a direct quote). **Future-action flag (Reference doc status §Part 7):** making top-3 explicit in `personas.md` would remove the inference step for future Designer passes.

---

## Part 1 — Per-persona JTBD × tool coverage

### Rob — Trades MD (mobile-dominant)

**Primary device context:** Phone. 60% of the day on job sites; desk time = evenings, reluctantly. `docs/personas.md:87–92`.

**Primary trust posture:** Supervised → spot-checked per-process. `docs/personas.md:108`.

| JTBD (Rob's words) | Human jobs | What Self must accomplish | Tool coverage | Shape concerns |
|---|---|---|---|---|
| **JTBD-R1: "Get quotes out the door from my phone."** `personas.md:98,102` | Capture → Delegate → Review | Accept voice/text capture on-site; classify; trigger `quote` process; present draft in ReviewCardBlock; adjust labour on phone; dispatch. | ⚠️ Present but mis-shaped | `quick_capture` + `orchestrate_work` + process run + `approve_review` / `edit_review` cover the flow. **Gap for Rob:** no voice-capture tool (human-layer.md:394 lists it as "Future capability"); on-site transcription not in the inventory. Mobile `ReviewCardBlock` exists; the ActionBlock approve flow works. Email send uses `crm.send_email` (staged, good for this persona's trust posture). |
| **JTBD-R2: "Follow up on dead quotes before I lose the job."** `personas.md:98,106` | Orient → Decide → Delegate | In morning brief: surface aging quotes as risk signals; propose follow-up drafts; one-tap send. | ✅ Covered in principle | `get_briefing` + `detect_risks` + `suggest_next` + `crm.send_email` (staged). Mobile flow uses TextBlock (brief narrative) + SuggestionBlock + ReviewCardBlock. **Mis-shape surface:** `crm.send_social_dm` covers LinkedIn/X for Rob's B2B customers; WhatsApp is how most of Rob's customers reach him — adapter exists, tool surface missing (Brief 208 scope). |
| **JTBD-R3: "Keep the business moving while I'm on a site."** `personas.md:100,106` | Orient → Review (inline) → Capture | Morning brief on phone; approve/edit/reject inline; voice-capture new jobs between tasks; hand off complex edits to "edit @ desk" tonight. | ⚠️ Present but mis-shaped | Today composition + ReviewCardBlock + prompt input all exist and are mobile-viable. **Mis-shape:** voice capture is architecturally present (`docs/human-layer.md:394`) but absent from the tool surface. "Edit @ desk" (Insight-012) is a UX pattern with no tool backing — Self can't currently mark an item as "triaged but needs desk follow-up" with persistence; the user would have to remember. |

**Rob's overall coverage read:** His core flow is mobile-composed from existing tools *except* voice capture. The single biggest UX gap for Rob is that `quick_capture` assumes typed input; on a job site with one gloved hand, that breaks. The messaging surface gap (Brief 208) also disproportionately affects Rob — his customers are on WhatsApp / SMS / voice-voicemail, not LinkedIn.

---

### Lisa — Ecommerce MD (desk + mobile hybrid)

**Primary device context:** Desk for content + strategy; phone for triage + quick approvals on commute. `docs/personas.md:119–125`.

**Primary trust posture:** Spot-checked for content after pattern-learning; supervised for pricing. `docs/personas.md:135–137`.

| JTBD (Lisa's words) | Human jobs | What Self must accomplish | Tool coverage | Shape concerns |
|---|---|---|---|---|
| **JTBD-L1: "Stop rewriting product descriptions — capture my voice once."** `personas.md:128–129` | Define → Review → Decide (teach) | Generate process via conversation; produce drafts; accept edits as implicit feedback; detect recurring correction pattern; offer "Teach this." | ✅ Covered | `generate_process` + `start_pipeline` + `approve_review`/`edit_review` + `search_knowledge` (brand-voice context). **Good shape for Lisa:** desk-based Define flow, mobile-viable Review flow, SuggestionBlock for pattern confirmation. The "Teach this" pattern is architecturally present (`human-layer.md:467`) but Designer notes it's *not yet interactive UI* — a known gap. |
| **JTBD-L2: "Know what's going wrong before the customer tells me."** `personas.md:130,133` | Orient → Decide | Run proactive monitoring (reviews, returns, quality signals); weave risk into briefing narrative; surface as AlertBlock. | ❌ Absent for Lisa's specific signals | `detect_risks` exists (returns aging items, stale data, correction-pattern signals — per `self-delegation.ts:419`). **Gap:** it doesn't watch external review sites, doesn't tail customer-service queues, doesn't read returns data. No tool exists to ingest Shopify/Trustpilot/ZenDesk. Lisa's "before the customer tells me" JTBD requires external-source polling Ditto doesn't have. |
| **JTBD-L3: "Monitor competitor pricing and trigger pricing review."** `personas.md:137` | Orient → Decide → Review | Schedule daily scan of competitor sites; extract pricing; diff against internal catalog; flag >15% gaps in morning brief. | ⚠️ Present but mis-shaped | `browse_web` (self-delegation.ts:791) can do a one-off extract. **Mis-shape:** there's no scheduled-scan tool visible in the inventory — the Self tool is manual-invoke only. Recurring scans are "Routines" (composition intent) per `human-layer.md:180`. The wiring between routines and `browse_web` is not visible on the current tool surface. `workspace.push_blocks` / `workspace.register_view` (tool-resolver.ts:870/920) can render a price-gap dashboard; no tool exists to *produce* the daily-scan work product. |

**Lisa's overall coverage read:** Content JTBD is well-covered; monitoring JTBD (both external signals and competitive pricing) is where Self currently runs out of tools. This is a Category 2 (inbound data) and Category 4 (generated monitoring artifacts) legibility question from Insight-201, not only a tool question.

---

### Jordan — IT generalist (desk-primary)

**Primary device context:** Desk; phone for commute brief only. `docs/personas.md:166`. Only persona with desk-first mode.

**Primary trust posture:** Needs to demonstrate value in 48 hours — supervised-to-spot-checked on a compressed timeline across multiple processes. `docs/personas.md:157,162`.

| JTBD (Jordan's words) | Human jobs | What Self must accomplish | Tool coverage | Shape concerns |
|---|---|---|---|---|
| **JTBD-J1: "Stand up a new process in 48 hours and demo it to a department."** `personas.md:157,162` | Define → Delegate | Conversational process definition; `generate_process` with YAML preview; test run; shareable link/output. | ✅ Covered | `generate_process` (self-delegation.ts:265) + `start_pipeline` + `generate_chat_link` (self-delegation.ts:770) + ProcessProposalBlock. **Good shape for Jordan:** desk-based Define, Process Builder right-panel (`human-layer.md:325–327`), magic-link output handoff. **Mis-shape noted:** `generate_chat_link` is described as "email-to-chat escalation" — may not be the right surface for demoing to a department head in a conference room. |
| **JTBD-J2: *See process health across all departments in one view* (scenario-derived from `personas.md:164`)** | Orient → Decide | Projects composition (process portfolio w/ health + metrics); cross-department filter; drill-down to any one process. | ⚠️ Present but mis-shaped | Projects composition exists (`human-layer.md:179`) with StatusCardBlock + MetricBlock + ChartBlock. **Mis-shape for Jordan:** no explicit department/team scoping in the tool surface. `cycle_status` (self-delegation.ts:721) is per-user, not per-org-unit. If Jordan stands up 4 processes for 3 departments, there's no tool to ask "show me everything HR owns." Hired-agents primitive (ADR-037) may shift this, but not yet shipped. |
| **JTBD-J3: *Demo the cross-department system to leadership* (scenario-derived from `personas.md:164`)** | Orient (Process Graph) | Render Process Graph showing inter-process dependencies; pan/zoom; read-only for the boardroom screen. | ❌ Absent | Process Graph is listed as a v0.1.0 Primitive in `human-layer.md:465` — "Not built — no visual process dependency map." No tool in the inventory produces a graph data shape, and `workspace.push_blocks` doesn't have a graph block type (26 ContentBlock types per `human-layer.md:200`, none is a graph). Jordan's demo-to-leadership JTBD currently has no Self-callable path. |
| **JTBD-J4: *Stand up a web-facing thing — portal, form, dashboard — in a couple of days* (scenario-derived from `personas.md:148,151,162`; confirmed as persona JTBD by user steer 2026-04-21)** | Define → Delegate → Decide | Conversational definition of the app's purpose, users, and data flow; preview rendered on mobile + desktop; deploy to a shareable URL; iterate by conversation; route inbound activity back into Ditto as work items. | ❌ Absent | No tool in the inventory produces a deployable web-facing artifact. `workspace.register_view` + `workspace.push_blocks` produce **internal** views inside Ditto's own workspace; they do not render at an external URL a customer or colleague could reach. `content.generate_image` produces visual assets only. Intended fulfilment: a **lightweight framework designed and maintained by Ditto** (user steer) — Architect owns the primitive shape. See G5 in Part 4 + open question #6. |

**Jordan's overall coverage read:** Define + first-process ship is well-covered — this is what Ditto shipped first. The *governance-view* JTBDs (cross-department health, Process Graph demo) are patterned-for in `human-layer.md` but not yet on the tool surface. The *make-a-thing-my-users-interact-with* JTBD (J4) is absent on every axis — no tool, no persona doc entry prior to 2026-04-21, no existing ContentBlock primitive for external-facing artifacts. Jordan is the persona whose success depends most on post-Operate reporting surfaces and on Ditto's ability to produce *things* (not just reports).

---

### Nadia — Team manager (desk + pre-meeting mobile brief)

**Primary device context:** Desk for review + coaching; phone for pre-standup brief. `docs/personas.md:176–182,194`.

**Primary trust posture:** Per-person, per-process trust governance. `docs/personas.md:196`.

| JTBD (Nadia's words) | Human jobs | What Self must accomplish | Tool coverage | Shape concerns |
|---|---|---|---|---|
| **JTBD-N1: "Remove operational overhead from each of my specialists."** `personas.md:186,192` | Define → Delegate | Define a process (e.g. report-formatting + compliance-check); assign it to specific team members; each gets their own process instance with their own trust history. | ⚠️ Present but mis-shaped | `generate_process` + `start_pipeline` exist. **Mis-shape:** no visible "assign to team member" semantics in the tool surface. Processes appear to be user-scoped; Nadia assigning the formatting process *to Chen's analyst instance* isn't a tool call that resolves cleanly. `adjust_trust` (self-delegation.ts:320) takes a `processSlug` — no per-person-scope parameter. This is an ADR-037 Hired-Agents-adjacent question. |
| **JTBD-N2: "See team-wide quality + health at a glance before standup."** `personas.md:187,194` | Orient → Decide | Compose a team-brief: which processes ran clean vs needed corrections; who's drowning; surface ChecklistBlock + StatusCardBlock for each team member; flag degrading trust. | ⚠️ Present but mis-shaped | Today composition + ChecklistBlock + StatusCardBlock exist. **Mis-shape:** the tool surface has no notion of "my team" — `get_briefing` (self-delegation.ts:405) is self-scoped (takes optional `userId`). Nadia's brief is fundamentally a cross-user aggregation; no tool produces this shape. |
| **JTBD-N3: "Govern trust per-person, per-process."** `personas.md:196` | Delegate | Accept system's per-person trust-upgrade suggestion; accept for one team member, defer for another, all within a single interaction. | ❌ Absent | `adjust_trust` sets one (processSlug, tier) pair. There's no tool for per-agent-per-process trust assignment. Nadia's delegation-cascade JTBD (the most distinctive one in personas.md) has no current tool expression. Hired Agents (ADR-037) + Agent Memory Scope (ADR-039) are the adjacent architectural moves, but the tool surface doesn't yet reflect them. |

**Nadia's overall coverage read:** Nadia is the persona the tool surface was *least* designed for. Every top-3 JTBD is either mis-shaped or absent because the current tool surface is single-user. The hired-agents primitive opens the door for her use case; the tools that surface it are not yet in the inventory.

---

## Part 2 — Cross-persona patterns

### Observation 1 — Mobile-viability is uneven by surface

The 72-entry tool inventory maps cleanly to human jobs when dispatched *by Self on desktop*. When the **user's device is a phone**, the following tools surface usability concerns (not bugs — UX shape issues):

- `quick_capture` (text-only) — Rob on a job site cannot type cleanly. Voice-capture is named "future" in `human-layer.md:394`. No voice-intake tool visible.
- `adapt_process` / `edit_process` / `generate_process` — produce YAML; reviewing YAML on mobile is not a design `human-layer.md` endorses ("complex edits happen at the desk" — `personas.md:46`). These are correctly desk tools; the UX question is whether Self prevents the user from invoking them on mobile, or triages them to "edit @ desk."
- `browse_web` extraction flows can return >500 chars and auto-promote to artifact mode (`human-layer.md:167`) — artifact mode is full-screen bottom-sheet on mobile, viable for scan but friction for edit.

### Observation 2 — "Edit @ desk" is a named UX pattern with no tool backing

Insight-012 (cited in `personas.md:49` and `human-layer.md:420`) describes acknowledging on mobile, completing at desk. There is no tool in the inventory that marks an item as "triaged-pending-desk-edit" or surfaces it next time the user opens the desktop app. Rob and Nadia both depend on this pattern; it's currently a design promise without a tool expression.

### Observation 3 — Single-user assumption pervades the self-tool surface

`get_briefing`, `detect_risks`, `suggest_next`, `cycle_status` all accept optional `userId` but have no team-scope concept. Nadia's three JTBDs + Jordan's department-view JTBD both surface this. The tool surface reflects a one-user-one-workspace model; personas 3 and 4 need multi-user aggregation.

### Observation 4 — Inbound-data capture is thin

Lisa's "know what's going wrong before the customer tells me" (JTBD-L2) needs tools that watch customer-review sites, returns queues, and support tickets. The integration registry has `slack.search_messages` and `google-workspace.search_messages` (inbox read); it has no Shopify/Trustpilot/ZenDesk/Helpdesk readers. Insight-201's Category 2 (inbound comms legibility) is the architectural parent of this gap.

### Observation 5 — Visual/spatial output types are absent

Jordan's "demo the Process Graph to leadership" has no tool support. The 26 ContentBlock types include `ChartBlock`, `DataBlock`, `MetricBlock`, `RecordBlock`, `InteractiveTableBlock` — all tabular/scalar, none graph. Brief 207 (draft) adds image *analysis*; no tool *produces* a graph/diagram/map. `content.generate_image` is present but general-purpose, not graph-structured.

### Observation 6 — Messaging channels as Rob's surface

Rob's customers reach him on WhatsApp and SMS. The current integration surface (Brief 208 calls this out) has adapter-level support for WhatsApp/Telegram/Instagram but no tool-surface entry. Rob's JTBD-R2 (follow-up) is disproportionately affected.

### Observation 7 — No primitive for external-facing artifacts (added 2026-04-21 via user steer)

Every output type in the inventory renders *inside Ditto* (Today composition, ReviewCardBlock, artifact mode, Process Builder panel). The 26 ContentBlock types are all internal-canvas shapes. No tool produces a thing that lives at a URL a customer, colleague, or department head can navigate to without a Ditto account. This affects Jordan JTBD-J4 primarily; Rob (customer intake pages), Nadia (team dashboards), and Lisa (custom landing pages alongside Shopify) all have latent variants. The closest adjacent-product pattern evaluated in `docs/landscape.md` is **json-render** (`docs/landscape.md:72–79`) — catalog-constrained LLM-authored UI with cross-platform rendering — which was adopted as a pattern for *rendered-view output infrastructure*. A Ditto-maintained lightweight framework would likely sit in the same design space.

---

## Part 3 — Six human jobs × tool-surface fit

Evaluated from the persona's experience, not from code inventory. "Well-served" means at least one persona's top-3 JTBD for that job is fully covered; "thin" means every persona's relevant JTBD for that job is either mis-shaped or absent.

| Human job | Fit for personas | Observed tool support | Persona-level gap |
|---|---|---|---|
| **Orient** | Well-served for single-user (all personas); thin for team/org scope (Jordan, Nadia) | `get_briefing`, `detect_risks`, `cycle_status`, Today composition | No team/department/org-scope briefing. Nadia JTBD-N2, Jordan JTBD-J2. |
| **Review** | Well-served inline + artifact mode (all personas) | `approve_review`, `edit_review`, `reject_review`, ReviewCardBlock | None at tool level; UX-level concern is artifact mode friction on mobile. |
| **Define** | Well-served desk-first for *internal* processes (all personas); thin for *external-facing apps* (Jordan) | `generate_process`, `adapt_process`, `edit_process`, ProcessProposalBlock | Per-team-member Define is absent (Nadia JTBD-N1). External-facing-app Define is absent on every axis (Jordan JTBD-J4). |
| **Delegate** | Well-served single-process; thin per-person (Nadia); thin for apps-to-external-users (Jordan) | `start_pipeline`, `adjust_trust`, sessionTrust override | `adjust_trust` is (process, tier) — not (process, team_member, tier). Nadia JTBD-N3. Trust tiers applied to *user-facing apps* (review first N submissions? spot-check?) is an undefined model. Jordan JTBD-J4. |
| **Capture** | Well-served desk + text (all); thin voice/on-site (Rob) | `quick_capture`, prompt input + drag-drop | Voice capture is absent. Rob JTBD-R1 + JTBD-R3. "Edit @ desk" state has no tool backing (Rob + Nadia). |
| **Decide** | Well-served single-signal; thin cross-signal (Lisa, Jordan); thin for iterating-on-deployed-artifacts (Jordan) | `suggest_next`, SuggestionBlock, `assess_confidence` | External-source signals (customer reviews, returns, competitor prices) require ingestion tools that don't exist. Lisa JTBD-L2 + L3. Iterating on a deployed app by conversation + rollback to prior versions is patterned-for but has no tool. Jordan JTBD-J4. |

---

## Part 4 — Interaction states where the gaps matter most

Named for the four most consequential coverage gaps; these are the states a Designer would specify in a brief.

### G1 — "On-site voice capture" (Rob JTBD-R1 + R3)

**The user's context:** Rob is standing at a customer's property, phone in one hand, customer talking, measurements on a receipt.

**Current interaction:** `prompt input` accepts text + drag-drop (`human-layer.md:120,392`). No voice button. Rob would have to hold phone in two hands, switch to system dictation, paste into prompt input, hit send.

**States to specify** (when voice capture exists):
- *Idle* — microphone button visible in PromptInput (composable subcomponent pattern, per `human-layer.md:226`).
- *Recording* — waveform or pulsing visual + cancel affordance; persists if screen dims.
- *Transcribing* — ShimmerBlock-style feedback; editable transcript on completion before send.
- *Send* — classifies (quote request? follow-up? new job?); Self confirms routing before dispatching tool.
- *Fail* — offline capture saved locally; uploads when connection returns ("Edit @ desk" corollary).

### G2 — "Triage on mobile, edit at desk" (Rob + Nadia)

**The user's context:** Rob sees a quote needs material-line adjustments; he can tap approve/reject but the labour breakdown needs the desk. Nadia sees a formatting correction that needs her judgment but she's in a meeting.

**Current interaction:** ActionBlock with approve/edit/reject. "Edit" on mobile surfaces an editor that may be unusable for this scope.

**States to specify:**
- *Mobile triage* — fourth action "Defer to desk" alongside approve/edit/reject.
- *Deferred badge* — sidebar/Today composition shows pending-desk items with "4 waiting for desk" header.
- *Desk surface* — on desktop open, Today composition prioritises deferred items.
- *Auto-escalate* — if deferred >24h, appear in next briefing as risk signal (via `detect_risks`).

### G3 — "Team brief before standup" (Nadia JTBD-N2)

**The user's context:** 8:00am Monday. Nadia has 3 minutes before standup. She needs to know which of her 6 analysts had process health slip overnight, and who has reviews pending that she needs to know about before they come up in standup.

**Current interaction:** `get_briefing` + Today composition are self-scoped. Nadia would have to invoke `cycle_status` for each team member individually (pages through one-by-one).

**States to specify** (when team-scope briefing exists):
- *Team-brief composition intent* — sidebar item "My Team" alongside "Today" / "Inbox" / "Work" (`human-layer.md:174`).
- *Header* — member roster with per-member green/amber/red dot.
- *Per-member ChecklistBlock* — what ran clean, what needed correction, what's pending.
- *Degradation callouts* — trust-downgrade signals pulled forward into briefing narrative.
- *Drill-down* — tap a member → process detail filtered to that member's runs.

### G5 — "Publish a thing for my users/customers" (Jordan JTBD-J4 primary; Rob + Nadia latent)

**Added 2026-04-21 via user steer: this is a persona JTBD, to be fulfilled by a lightweight framework designed and maintained by Ditto. Architect owns primitive shape.**

**The user's context:** Jordan is asked Monday to give HR a reference-check portal; Wednesday HR wants to send the URL to candidates. Rob wants a link customers can tap from a text to submit a quote request with photos. Nadia wants her team to see project status at a bookmarkable URL without logging into Ditto.

**Current interaction:** None. `workspace.register_view` registers a view inside Ditto's own workspace; external users cannot reach it.

**Process-owner's experience (the design contract):** They describe what the thing is, who uses it, what happens to submissions. They never pick technology, write code, or configure components. They see a preview, approve it, and the thing is live at a URL they can share. When they want to change it, they say what's different; when they want to revert, they say "go back to last week's version." Activity on the thing flows into Ditto as work items they already know how to review.

**States to specify:**
- *Define* — conversational: Self asks what the thing is (portal / form / dashboard / landing page), who the users are, what fields/data/actions they need, what should happen to submissions. One question at a time (progressive disclosure per `human-layer.md:63–73`).
- *Preview* — rendered mobile + desktop frame inline in conversation (ProcessProposalBlock analogue). Process-owner scrolls the preview like a real device, taps buttons to feel the flow.
- *Deploy* — single ActionBlock ("Make it live"); URL returned in conversation; QR code surface for Rob's SMS-paste case; shareable link for Jordan's HR-team case.
- *Running* — sidebar gains an "Apps" surface (sibling to Projects/Routines per `human-layer.md:174`) with StatusCardBlock per app (usage, submissions, errors).
- *Inbound* — submissions/interactions become `work_items` (or equivalent) routed through the process-owner's Inbox composition. Trust-tier-posture is supervised by default: first N submissions flagged for review; promotes to spot-checked / autonomous based on correction patterns (reuses existing trust mechanism).
- *Iterate* — conversational edits ("add a phone-field", "change the confirmation text", "make it match the brand palette"). Preview updates live; process-owner approves the change before it goes out to users.
- *Rollback* — prior versions listed (like `process_history` / `rollback_process` analogue). Self surfaces "revert to last week's version" as a SuggestionBlock when a recent change correlates with increased submission abandonment or complaint signals.
- *Teach-pattern* — recurring edits (Rob adds postcode field every time; Jordan always adds an "urgency" dropdown) become "Teach this?" suggestions that update the framework's defaults for this process-owner.
- *Mobile vs desktop* — Define + Preview + Iterate are desk-first (Jordan's desk-primary posture; Rob reluctantly). Deploy + Monitor are mobile-viable (notifications when a new submission arrives; quick review on phone).

**Primitives involved:** ProcessProposalBlock (preview), ActionBlock (deploy), StatusCardBlock (running health), SuggestionBlock (teach/rollback/iterate), new Apps sidebar surface, new ContentBlock type TBD for embedded preview-frame rendering (Architect decision).

**Cross-persona note:** This is Jordan's primary JTBD. Rob's use case (customer intake surface) is legitimate but lower-priority for him — messaging (Brief 208) closes his gap more directly. Nadia's use case (team-facing dashboard) overlaps with JTBD-N2 but for external-to-Ditto rendering. Lisa is not well-served by this primitive — she uses Shopify for her customer-facing surfaces; Ditto apps would be secondary.

### G4 — "Process Graph demo" (Jordan JTBD-J3)

**The user's context:** Jordan is presenting to leadership on a meeting-room screen. They want to show 4 processes across 3 departments and the data flows between them.

**Current interaction:** Projects composition uses StatusCardBlock + MetricBlock + ChartBlock (no graph block). Jordan would have to describe the system verbally; no visual.

**States to specify** (when Process Graph exists):
- *Graph composition intent or dedicated view* — nodes = processes, edges = output-to-input bindings.
- *Static snapshot vs live* — static mode for demos (no unexpected movement in a boardroom); live mode for investigation.
- *Zoom/pan* — boardroom screens need big legible labels; hover affordances are mouse-only.
- *Read-only share* — one-tap shareable link (tool-mechanism TBD by Architect; shape expectation: persistent, read-only URL that renders the graph as of share-time).

---

## Part 5 — UX pattern sources (factual, not evaluative)

Neutral notes on where similar coverage surfaces exist in the adjacent ecosystem:

- **Paperclip's `CompanySkills` admin** (covered in `docs/research/tool-surface-landscape.md` §B.1) surfaces per-agent skill attachment with `attachedAgentCount` — this is the closest existing pattern to Nadia JTBD-N1 (assign capability to team member).
- **Paperclip's `AgentDetail` 6-tab view** (see `docs/landscape.md:40`) shows per-agent process runs + health — reference for Nadia JTBD-N2 (per-member health pane).
- **Paperclip's `OrgChart` (SVG pan/zoom)** (`docs/landscape.md:40`) is the closest shipped pattern to Jordan JTBD-J3 (Process Graph).
- **ElevenLabs voice transport layer** (covered in `docs/landscape.md:286–295`) is the adopted voice substrate; closest shipped pattern to G1 (on-site voice capture) — though Ditto's front-door voice is not yet inbound-capture.
- **AI Elements Queue + ChecklistBlock** (`human-layer.md:234,245`) is the closest component pattern for G3 (team brief).

No original-to-Ditto patterns emerged in this pass — every gap maps to an adjacent-project reference or a Ditto architecture principle already in docs.

---

## Part 6 — What this spec does not decide

Per the Designer role contract (design boundary, not technical boundary):

1. It does **not** recommend specific tools be added or tool surfaces be restructured. Those are Architect decisions informed by the Researcher's inventory + this spec.
2. It does **not** prescribe whether team-scope belongs on existing tools (add a `teamMemberId?` param) or as new tools (`team_briefing`, `team_adjust_trust`). That's a composability trade-off the Architect must weigh.
3. It does **not** evaluate Insight-185 (tools-express-intent) vs per-channel tool expansion — that tension appeared in Brief 208 and is architectural, not UX.

What this spec **does** decide:
- The four G-states above are the persona-level UX contracts any tool-surface brief must honor.
- The six-human-jobs × personas table is the coverage lens for future surface work.
- The Observation-1 through Observation-6 patterns are design constraints for Architect briefs.

## Open questions for the Architect

1. **Voice capture shape.** If on-site voice capture becomes a tool, is it a new Capture-family tool or an input modality for `quick_capture`? Affects the PromptInput composition (`human-layer.md:226`) and whether it requires ElevenLabs or native platform speech.
2. **Deferred-to-desk state primitive.** Is "triaged-pending-desk-edit" a new work_item lifecycle state (ADR-047 outcome-owners) or a tool-level acknowledgment with TTL? Affects whether Self proactively re-surfaces these.
3. **Team-scope vs single-user default.** Do existing Self tools acquire `teamContext` parameters, or does a new Self surface (`team_self`?) emerge? Nadia's JTBD-N1/2/3 all turn on this.
4. **Process Graph block type.** Does this become a 27th ContentBlock (compositional, renderable anywhere) or a dedicated composition intent ("Graph" alongside Today/Inbox/Work)? Affects whether the graph is shareable, embeddable, or surface-specific.
5. **Inbound-source integrations scope.** Lisa's JTBD-L2 requires Shopify/Trustpilot/ZenDesk readers. Does this belong in the integration registry (MCP or CLI)? Insight-201 Category 2 (inbound comms legibility) is the governing architectural question.
6. **App-building primitive shape (Jordan JTBD-J4 / G5).** User steer: a **lightweight framework designed and maintained by Ditto**. Open architectural questions: (a) is an app a *durable primitive* (versioned, edited in place) or a *process output* (regenerated each run)? (b) what catalog of components does the framework constrain the LLM to (see `docs/landscape.md:72–79` json-render as the adjacent adopted pattern)? (c) where does the URL point — Ditto-hosted sub-path, user-chosen domain, both? (d) how do trust tiers apply to user-facing submissions (review first N? spot-check? autonomous after threshold)? (e) do submissions become `work_items` directly, or does a per-app classifier process route them? (f) how does this relate to existing `workspace.register_view` / `workspace.push_blocks` — are they siblings (internal views + external apps) or does one generalise? (g) does the Hired Agents primitive (ADR-037) own the app's runtime identity (app-as-agent) or is it a new category?

## Reference doc status

- **Reference docs updated this session:** none. This spec is net-new persona-grounded coverage material.
- **Reference docs checked, no drift found:**
  - `docs/personas.md` — current (v0.2.1, 2026-03-31); 4 personas + motivational JTBD table + emotional journey all align with this spec's usage.
  - `docs/human-layer.md` — current (v0.2.0, 2026-03-31); 6 human jobs + 26 ContentBlock types + composition-intent model all referenced accurately.
- **Potential future update flags (for Documenter):**
  - `docs/human-layer.md:454–469` "What's Next: Gaps Between Architecture and Experience" table — add G1–G4 states from this spec if Architect briefs consume them.
  - `docs/personas.md:258–264` — table is shared-across-personas. Persona-specific top-3 JTBD enumeration would remove the inference step documented in Part 1's preamble. Flag for next Documenter pass that needs this lens.
  - Minor: `human-layer.md:466` citation in Part 1 Lisa row (the spec originally cited `:467`) — trivial off-by-one surfaced in Reviewer pass.

---

## Summary for the Architect

- **Five persona-level UX gaps (G1–G5)** the tool surface currently does not serve: on-site voice capture (G1), mobile-triage-desk-edit handoff (G2), team-scope briefing (G3), Process Graph demo view (G4), and publishing a user/customer-facing app (G5 — user-steered addition, fulfilled by a Ditto-maintained lightweight framework).
- **Seven cross-persona observations** that constrain how those gaps should be filled.
- **Six open questions** that require architectural judgment the Designer cannot make — G5 alone contributes seven sub-questions reflecting the primitive's breadth.
- **Coverage matrix** showing two personas (Rob, Nadia) disproportionately under-served by the current tool surface; Lisa has one clean gap (external-data ingestion); Jordan's Define JTBD is well-served for *internal processes* but absent for *external-facing apps* (J4) and demo-ready governance views (J3).

This spec pairs with `docs/research/tool-surface-landscape.md` (Researcher) as dual input to the Architect per `CLAUDE.md` role contract. G5 / J4 specifically is new architectural territory — may warrant its own brief and ADR.
