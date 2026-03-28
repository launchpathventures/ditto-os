# Research: OpenOats — Meeting Intelligence & Real-Time Context Surfacing

**Date:** 2026-03-28
**Question:** How can OpenOats (github.com/yazinsai/OpenOats) be incorporated into Ditto? What patterns, capabilities, or code are relevant?
**Status:** Complete — awaiting review

---

## Context

Ditto's architecture envisions connecting to an organisation's data sources to build a persistent, evolving understanding of how the organisation actually works. Meetings are a primary site where decisions happen, work gets assigned, and processes are discussed — but Ditto currently has no mechanism for ingesting real-time conversation data. OpenOats is an open-source meeting intelligence tool that captures conversations, transcribes them locally, and surfaces relevant knowledge in real time.

This research evaluates what OpenOats does, how it works technically, and what Ditto could build FROM — following the three pragmatic levels: **depend**, **adopt**, or **pattern**.

---

## Executive Summary

### What OpenOats Is

OpenOats is a macOS meeting assistant (Swift, 2014 stars, MIT license, active March 2026) that:
1. **Captures both sides** of a conversation — mic audio (you) + system audio (them)
2. **Transcribes locally** using WhisperKit (Apple Silicon) — no audio leaves the device
3. **Searches a user-provided knowledge base** (markdown/text files → chunked, embedded, vector-searched) to surface relevant talking points in real time
4. **Generates structured meeting notes** from templates (1:1, Customer Discovery, Hiring, Stand-Up, Weekly) using LLM post-processing

### What's Relevant to Ditto

Three distinct capabilities map to Ditto's architecture:

| Capability | Ditto layer | Composition level | Rationale |
|-----------|-------------|-------------------|-----------|
| **Real-time context surfacing** (KB search → LLM synthesis during live interaction) | L4 Awareness, L6 Human | **Pattern** | The three-layer suggestion pipeline (prefetch → gate → synthesize) is a strong pattern for proactive intelligence. Swift-native, can't adopt code. |
| **Meeting-to-process pipeline** (transcript → structured notes → work items) | L1 Process, L5 Learning | **Pattern** | Transcripts are a rich source for process discovery. Template-based note generation maps to Ditto's process template system. |
| **Knowledge base with RAG** (chunk → embed → vector search → rerank) | L4 Awareness | **Pattern** | The chunking/embedding/search pipeline is well-implemented but Swift-native. Ditto's TypeScript stack needs its own implementation. QMD (already in landscape.md) is the closer candidate for knowledge search infrastructure. |
| **Privacy-first audio capture** (local transcription, no audio transmission) | Cross-cutting | **Pattern** | Privacy model aligns with Ditto's sovereignty principle. On-device transcription is the right default for sensitive business conversations. |

### Key Finding

OpenOats is a **pattern** source, not an **adopt** or **depend** candidate. It is a Swift/macOS-native application — zero code transfers to Ditto's TypeScript/Node.js stack. However, three architectural patterns are highly valuable:

1. **Three-layer suggestion pipeline** — prefetch + gate + synthesize is the pattern for Ditto's proactive intelligence (Brief 043's `suggest-next` and `detect-risks` are early versions of this)
2. **Meeting as process input** — transcripts feeding process discovery and work item creation maps directly to Ditto's Analyze mode and process-discoverer system agent
3. **Burst-decay throttling** — the attention management pattern (don't flood the user with suggestions) maps to Ditto's attention model (ADR-011)

---

## Part 1: OpenOats Technical Architecture

### Overview

| Property | Value |
|----------|-------|
| Language | Swift 6.2 |
| Platform | macOS 15+ (Apple Silicon) |
| License | MIT |
| Stars | 2,014 |
| Forks | 191 |
| Created | 2026-02-28 |
| Last pushed | 2026-03-28 |
| Age | 28 days (created 2026-02-28) |
| Maturity | Young — patterns may reflect initial design not yet tested at scale. For a "pattern" source this matters less than for "adopt"/"depend", but worth noting. |
| Package manager | Swift Package Manager |

### Dependencies

| Dependency | Purpose |
|-----------|---------|
| **WhisperKit** (fork) | Local speech-to-text via Apple's CoreML |
| **FluidAudio** | Audio capture and processing |
| **Sparkle** | macOS app auto-update |
| **LaunchAtLogin-Modern** | Login item management |

### Source Structure

```
OpenOats/Sources/OpenOats/
├── App/                    # Application entry, lifecycle
├── Audio/                  # 3 files: AudioRecorder, MicCapture, SystemAudioCapture
├── Domain/                 # 4 files: MeetingState, MeetingTypes, Utterance, ExternalCommand
├── Intelligence/           # 12 files — the core AI pipeline
│   ├── KnowledgeBase.swift         # Chunk → embed → vector search → rerank
│   ├── SuggestionEngine.swift      # Three-layer real-time suggestion pipeline
│   ├── NotesEngine.swift           # Transcript → structured meeting notes
│   ├── TranscriptCleanupEngine.swift
│   ├── TranscriptRefinementEngine.swift
│   ├── RealtimeGate.swift          # Decides whether to surface a suggestion
│   ├── BurstDecayThrottle.swift    # Prevents suggestion flooding
│   ├── PreFetchCache.swift         # 30s TTL cache for KB queries
│   ├── MarkdownMeetingWriter.swift
│   ├── OpenRouterClient.swift      # Cloud LLM provider
│   ├── OllamaEmbedClient.swift     # Local embeddings
│   └── VoyageClient.swift          # Voyage AI embeddings + reranking
├── Meeting/                # 3 files: MeetingDetector, NotificationService, WebhookService
├── Models/                 # Data models
├── Settings/               # Configuration
├── Storage/                # 4 files: SessionRepository, TemplateStore, GranolaImporter, LegacySessionReader
├── Transcription/          # 10 files — multi-backend transcription
│   ├── TranscriptionEngine.swift   # Orchestrates dual audio streams
│   ├── StreamingTranscriber.swift  # Real-time transcription
│   ├── TranscriptionBackend.swift  # Backend protocol
│   ├── WhisperKitBackend.swift     # WhisperKit implementation
│   ├── ParakeetBackend.swift       # Alternative backend
│   ├── Qwen3Backend.swift          # Qwen3 speech model backend
│   ├── BatchTranscriptionEngine.swift
│   ├── DiarizationManager.swift    # Speaker identification
│   ├── AcousticEchoFilter.swift
│   └── WhisperKitManager.swift
└── Views/                  # SwiftUI views
```

---

## Part 2: Key Patterns Worth Extracting

### Pattern 1: Three-Layer Suggestion Pipeline

**Source:** `OpenOats/Sources/OpenOats/Intelligence/SuggestionEngine.swift`

The suggestion engine operates in three concurrent layers:

| Layer | Trigger | Action | Latency |
|-------|---------|--------|---------|
| **1. Continuous prefetch** | Every N seconds during conversation | Query KB on partial speech (5+ words), cache results with 30s TTL | Background |
| **2. Instant retrieval + gating** | Finalized utterance from either speaker | Search KB (or cache hit), evaluate via `RealtimeGate` (similarity threshold + conversation density), throttle via `BurstDecayThrottle` | < 1s |
| **3. Streaming synthesis** | Gate passes + throttle allows | Stream LLM call with trigger context + KB evidence, update UI token-by-token | 1-3s |

**Trigger classification:** Questions, claims, topic shifts, and general domain relevance.

**Why it matters for Ditto:** This is the architectural pattern for proactive intelligence during any real-time interaction — not just meetings. Ditto's Self already has `suggest-next` and `detect-risks` tools (Brief 043), but they operate on-demand, not continuously. The prefetch + gate + synthesize pattern could inform how the Self monitors ongoing work and proactively surfaces relevant context.

### Pattern 2: Knowledge Base RAG Pipeline

**Source:** `OpenOats/Sources/OpenOats/Intelligence/KnowledgeBase.swift`

| Stage | Implementation |
|-------|---------------|
| **Chunking** | Header-hierarchy-aware markdown splitting, 80-500 word targets, overlapping windows for large sections, breadcrumb preservation |
| **Embedding** | Three providers: Voyage AI, Ollama (local), OpenAI-compatible. Config fingerprinting for cache invalidation |
| **Caching** | Disk-based JSON, keyed by `filename:sha256hash`, auto-prune on config change |
| **Search** | Multi-query cosine similarity with max-score fusion per chunk. Top-10 reranking via Voyage AI (fallback to cosine) |
| **Output** | `KBContextPack`: matched text + file path + breadcrumb + similarity score |

**Why it matters for Ditto:** This is a clean implementation of the same RAG pipeline Ditto will need for organisational knowledge. However, QMD (already evaluated in landscape.md) is a more direct fit for Ditto's TypeScript stack — it provides BM25 + vector + LLM reranking with SQLite storage and MCP server integration.

### Pattern 3: Meeting-to-Work Pipeline

**Sources:** `NotesEngine.swift`, `TemplateStore.swift`, `MeetingDetector.swift`

The pipeline:
1. **Detect** meeting (audio activity from conferencing apps)
2. **Transcribe** with speaker attribution (mic = you, system = them, diarization for multi-party)
3. **Template selection** — user picks a template (1:1, Customer Discovery, etc.) that defines the LLM system prompt
4. **Note generation** — transcript (truncated to 60K chars, head/tail preserved) → LLM → structured markdown
5. **Auto-save** — plain-text transcript + structured session log

**Why it matters for Ditto:** Meetings are where processes are discussed, decisions made, and work assigned. A meeting transcript is a rich input for:
- **Process discovery** (process-discoverer system agent) — "we do X every week" patterns
- **Work item capture** — action items, commitments, follow-ups
- **Knowledge enrichment** — decisions and context that should feed organisational memory
- **Process validation** — comparing what people say they do vs. what processes define

### Pattern 4: Attention Management (Burst-Decay Throttling)

**Source:** `OpenOats/Sources/OpenOats/Intelligence/BurstDecayThrottle.swift`

Prevents suggestion flooding by enforcing minimum intervals between suggestions, with decay over time. The `RealtimeGate` adds a second filter: only surface when KB similarity exceeds threshold AND conversation density warrants it.

**Why it matters for Ditto:** Maps directly to the attention model (ADR-011, `docs/research/human-cognition-models-for-ditto.md`). The "management by exception" and "calm technology" patterns from the HITL research (`docs/research/human-in-the-loop-interface-patterns.md`) describe the same problem at the UX level. OpenOats solves it at the engine level with a concrete throttling mechanism.

### Pattern 5: Privacy-First Audio Architecture

**Sources:** `Audio/MicCapture.swift`, `Audio/SystemAudioCapture.swift`, `Transcription/TranscriptionEngine.swift`

- Audio captured via macOS system APIs (mic + system audio separately)
- Transcription runs entirely on-device via WhisperKit (CoreML)
- In cloud mode, only text (KB chunks + conversation context) is transmitted
- In local mode (Ollama), zero network traffic

**Why it matters for Ditto:** Ditto's target users (small businesses, professional services) handle sensitive client conversations. Any meeting intelligence capability must default to local-first audio processing. This validates the sovereignty principle.

---

## Part 3: Integration Options for Ditto

### Option A: Meeting Intelligence as an Integration

Treat OpenOats as an external application that feeds data into Ditto via its webhook/export capabilities.

**How it works:**
- OpenOats has `WebhookService.swift` for sending meeting events externally
- Auto-saved transcripts are plain-text files that could be monitored
- Ditto's process I/O system (Brief 036) already supports polling-based triggers

**What Ditto gets:**
- Meeting transcripts as process inputs (trigger a "meeting follow-up" process)
- Structured notes for knowledge enrichment
- No code changes to OpenOats needed

**Gaps:**
- One-way data flow (OpenOats → Ditto). No real-time context surfacing from Ditto's knowledge during meetings
- macOS-only. Ditto users on other platforms get nothing
- Requires OpenOats to be installed and running separately

### Option B: Build Meeting Intelligence as a Ditto Capability

Build a TypeScript/web-based meeting intelligence layer within Ditto, using OpenOats patterns but Ditto's own stack.

**How it works:**
- Web Audio API or desktop audio capture (Electron/Tauri) for audio
- Whisper.cpp (via WASM or native binding) or cloud speech-to-text for transcription
- Ditto's own knowledge base (future, per QMD evaluation) for context surfacing
- Three-layer suggestion pipeline adapted for Ditto's Self and proactive engine

**What Ditto gets:**
- Full bidirectional intelligence — Ditto's organisational memory surfaces during meetings
- Cross-platform (web, desktop)
- Meeting data feeds directly into process discovery, work item creation, knowledge enrichment
- Unified experience — no separate app

**Gaps:**
- Significant engineering effort (audio capture, transcription, RAG pipeline)
- Web Audio API limitations vs. native macOS audio capture
- Local transcription in browser is less mature than CoreML on Apple Silicon

### Option C: Pattern Extraction Only (No Meeting Feature)

Extract the three-layer suggestion pipeline pattern and apply it to Ditto's existing proactive engine, without building meeting-specific capabilities.

**How it works:**
- Adapt prefetch + gate + synthesize for the Self's proactive intelligence
- Apply burst-decay throttling to suggestion delivery
- Use the KB RAG pipeline pattern when building Ditto's knowledge layer

**What Ditto gets:**
- Better proactive intelligence architecture
- Attention management at the engine level
- No meeting-specific capability (deferred to future phase)

**Gaps:**
- Doesn't capture meeting data — a significant source of organisational process knowledge
- Users still need separate tools for meeting intelligence

### Option D: Webhook Integration Now, Native Capability Later

Phased approach: immediate lightweight integration via OpenOats webhooks/transcripts, with a native meeting intelligence capability on the roadmap.

**How it works:**
- Phase 1: Ditto integration YAML for OpenOats (watch transcript folder, ingest meeting notes)
- Phase 2: Meeting data feeds process discovery and work item creation
- Phase 3: Build native meeting intelligence using OpenOats patterns + Ditto's stack

**What Ditto gets:**
- Immediate value from meeting data without building audio/transcription infrastructure
- Progressive path to native capability
- Pattern validation before full investment

**Gaps:**
- Phase 1 is macOS-only, OpenOats-dependent
- Phase 3 is a large engineering effort

---

## Part 4: Cross-Reference with Existing Ditto Research

| Existing research | Relationship to OpenOats |
|-------------------|------------------------|
| `api-to-tool-generation.md` | Browser automation section deferred Stagehand. OpenOats is a different input modality — audio, not browser. Both feed the same goal: getting organisational data into Ditto. |
| `process-discovery-from-organizational-data.md` | Meeting transcripts are one of the 7 data sources identified. OpenOats provides the capture mechanism. |
| `human-in-the-loop-interface-patterns.md` | Burst-decay throttle and RealtimeGate map to "calm technology" and "management by exception" patterns. |
| `human-cognition-models-for-ditto.md` | Suggestion gating maps to attention budget concepts from cognitive science research. |
| `onboarding-intake-coaching-patterns.md` | Meeting templates (1:1, Customer Discovery) are an instance of the template-guided interaction pattern. |
| QMD evaluation in `landscape.md` | QMD is the TypeScript-native candidate for knowledge search. OpenOats KB is Swift-native with similar patterns (chunk → embed → search → rerank). QMD is the better fit for Ditto. |

---

## Part 5: Factual Pros/Cons Per Option

### Option A (Integration)
- **Pro:** Zero code to write in Ditto's core. Immediate value if user has OpenOats.
- **Pro:** OpenOats is actively maintained, MIT licensed, well-architected.
- **Con:** macOS-only. Not all Ditto users will have OpenOats.
- **Con:** One-way data flow. No real-time Ditto knowledge surfacing during meetings.
- **Con:** Adds external dependency for a core data source.

### Option B (Build Native)
- **Pro:** Full control. Cross-platform. Bidirectional intelligence.
- **Pro:** Meeting data feeds directly into all Ditto layers.
- **Con:** Large engineering scope (audio capture, transcription, RAG).
- **Con:** Browser-based audio/transcription less mature than native macOS.
- **Con:** Premature — Ditto hasn't shipped its knowledge layer yet.

### Option C (Pattern Only)
- **Pro:** Zero additional scope. Improves existing proactive engine.
- **Pro:** Patterns are well-validated by OpenOats's real-world use.
- **Con:** No meeting data capture capability.
- **Con:** Misses a significant organisational data source.

### Option D (Phased)
- **Pro:** Immediate value + progressive investment.
- **Pro:** Validates patterns before full commitment.
- **Con:** Phase 1 is macOS-only.
- **Con:** Phase 3 timeline is unclear.

---

## Gaps — Original to Ditto

1. **Bidirectional meeting intelligence** — OpenOats surfaces the user's notes during meetings. Ditto could surface organisational process knowledge, active work item status, and relationship context. No existing tool does this.
2. **Meeting → process discovery pipeline** — Automatically detecting process patterns from recurring meeting transcripts. OpenOats generates notes; it doesn't mine for process structure.
3. **Cross-meeting knowledge accumulation** — OpenOats sessions are independent. Ditto's memory architecture (ADR-003) could accumulate knowledge across meetings, surfacing "last time you discussed X with this person, you decided Y."
4. **Meeting as trust signal** — Human decisions made in meetings (approvals, corrections, assignments) could feed Ditto's trust-earning system as high-confidence signals.
5. **Multi-party meeting attribution** — OpenOats uses a two-speaker model (mic = you, system = them) with basic diarization for system audio. Business meetings are frequently multi-party. Reliable speaker attribution in multi-party meetings is a significant technical challenge that any Ditto meeting intelligence capability would need to address.

---

## Part 6: OpenOats as Ditto macOS App — Fork Feasibility & Flow to Value

**Addendum (2026-03-28):** Follow-up research question — can OpenOats be the basis of a native macOS app for Ditto? What is the strongest flow to value?

### Why This Changes the Composition Level

The original research assessed OpenOats at **pattern** level because Ditto is TypeScript and OpenOats is Swift. But if Ditto wants a native macOS surface, the Swift code IS the right language. This shifts the assessment to **adopt** — fork the source, understand it, adapt it, own it. OpenOats' MIT license permits this fully.

### What OpenOats Has Already Solved (Hard macOS Problems)

These are capabilities that are non-trivial to build from scratch and that OpenOats has production-tested:

| Capability | Source files | Why it's hard |
|-----------|-------------|---------------|
| **System audio capture** | `SystemAudioCapture.swift` | Requires ScreenCaptureKit (macOS 13+), permission grants, sample rate conversion |
| **Mic + system dual-stream** | `TranscriptionEngine.swift` | Two independent async audio streams with separate transcription instances |
| **On-device transcription** | `WhisperKitBackend.swift`, `ParakeetBackend.swift`, `Qwen3Backend.swift` | CoreML model loading, streaming partial results, 6 model backends |
| **Meeting auto-detection** | `MeetingDetector.swift` | Detect when conferencing apps (Zoom, Meet, Teams) start calls |
| **Invisible to screen share** | SwiftUI window configuration | macOS window level that hides from screen capture |
| **Voice activity detection** | `StreamingTranscriber.swift` | Silero VAD integration, pre-roll buffering, min-speech thresholds |
| **Speaker diarization** | `DiarizationManager.swift` | LS-EEND model for multi-speaker identification |
| **Menu bar app lifecycle** | `MenuBarPopoverView.swift`, `MiniBarPanel.swift` | Always-present, low-profile macOS citizen |

Building these from scratch in Swift would take weeks-to-months. OpenOats delivers them working.

### What Ditto's Web Backend Already Exposes

The API surface is sufficient for a native macOS companion today:

| Ditto API | macOS app usage |
|-----------|----------------|
| `POST /api/chat` → SSE stream | Converse with the Self — ask questions, create work items, capture meeting insights |
| `GET /api/feed` | Show pending reviews/work items in menu bar |
| `POST /api/feed` | Approve/edit/reject from native notifications |
| `GET /api/events` → SSE stream | Real-time process status in menu bar (step-start, gate-pause, run-complete) |
| `POST /api/credential` | Secure credential input via native macOS dialog |
| `GET /api/processes` | Show process status, active work |

### The Fork: What to Keep, Replace, and Add

| Layer | Keep from OpenOats | Replace / Adapt | Add for Ditto |
|-------|-------------------|-----------------|---------------|
| **Audio** | `MicCapture`, `SystemAudioCapture`, `AudioRecorder` — unchanged | — | — |
| **Transcription** | All 6 backends, VAD, diarization — unchanged | — | — |
| **Intelligence** | `RealtimeGate`, `BurstDecayThrottle`, `PreFetchCache` | `KnowledgeBase.swift` → query Ditto Self API instead of local file KB | `SuggestionEngine` rewired: Layer 1 prefetches from Ditto memory, Layer 3 synthesizes via Ditto Self |
| **Meeting lifecycle** | `MeetingState` state machine, `MeetingDetector`, `AppCoordinator` slim coordinator pattern | — | Webhook/API call to Ditto on meeting end |
| **Notes** | `NotesEngine` template system, `TemplateStore` | Output destination → Ditto work item creation via API | Meeting-to-work-item pipeline |
| **Storage** | `SessionRepository` for local transcript storage | — | Sync transcripts to Ditto for process discovery |
| **Views** | `MenuBarPopoverView`, `MiniBarPanel`, `TranscriptView`, `ControlBar`, `OverlayPanel` | Rebrand UI to Ditto design system (forest green / emerald palette) | Ditto feed panel, review actions, process status, Self conversation |
| **Settings** | `SettingsView` for audio/model config | Add Ditto connection settings (server URL, auth) | — |

**Estimated keep ratio:** ~70% of OpenOats code stays, ~15% is replaced, ~15% is new Ditto-specific code.

### Strongest Flow to Value: Three Phases

#### Phase 1: "Ditto Listens" (smallest viable fork)

**What ships:** A rebranded OpenOats that sends meeting transcripts to Ditto after each meeting.

**Changes from OpenOats:**
1. Fork repo, rebrand (name, icon, colours — use Ditto's forest/emerald palette)
2. Add Settings field: Ditto server URL
3. On meeting end, `POST /api/chat` with message: "Meeting transcript with [app] — [duration]. Here's what was discussed: [transcript]. Create work items for any action items, decisions, or follow-ups."
4. The Self receives this, creates work items, feeds process discovery
5. Keep everything else — local transcription, local KB, local suggestions all work as-is

**What the user gets:**
- Every meeting automatically creates follow-up work items in Ditto
- No manual capture — meetings flow into Ditto's process pipeline
- Local transcription privacy preserved
- OpenOats' existing features (KB suggestions, notes) still work standalone

**Engineering effort:** 1-2 weeks including codebase familiarisation (best case: days if Swift-proficient). The webhook payload format is already defined in `WebhookService.swift` — adapt it to POST to Ditto's API instead.

**Why this is the strongest first step:** It solves the #1 problem identified in the process discovery research — getting organisational data into Ditto. Meetings are where work originates. Today that data is lost. This captures it.

#### Phase 2: "Ditto Speaks" (bidirectional intelligence)

**What ships:** During meetings, the app surfaces Ditto's organisational knowledge — not just the user's local notes.

**Changes from Phase 1:**
1. Replace `KnowledgeBase.swift` search → `POST /api/chat` to Self with context query
2. `SuggestionEngine` Layer 1 prefetches from Ditto: "What do I know about [topic from partial speech]?"
3. Layer 2 gate evaluates Ditto response relevance (same threshold logic)
4. Layer 3 streams Self's response as suggestion card
5. SSE connection to `/api/events` shows active process status in overlay

**What the user gets:**
- "Last time you talked to Henderson, you agreed to revise the quote by 15%" surfaces mid-meeting
- Active work item status visible during calls ("The invoice reconciliation process is waiting for your review")
- Cross-meeting memory — Ditto remembers what happened in previous meetings with this person/topic

**Engineering effort:** 1-2 weeks. Main complexity is wiring SuggestionEngine to async HTTP calls and handling latency gracefully (local KB returns in ms; API calls take 1-3s).

**Why this is high-value:** This is the "bidirectional meeting intelligence" gap identified as Original to Ditto. No existing tool does this. OpenOats surfaces your notes; Ditto surfaces your organisation's knowledge.

#### Phase 3: "Ditto Lives Here" (full macOS surface)

**What ships:** The meeting intelligence becomes one feature of a full Ditto macOS companion.

**Changes from Phase 2:**
1. Add Self conversation panel — talk to Ditto from the menu bar (uses `POST /api/chat`)
2. Add feed/review panel — pending reviews show as native macOS notifications, approve/reject from notification actions (uses `GET/POST /api/feed`)
3. Add quick capture — ⌘+Shift+D global hotkey to capture a thought to Ditto (uses `create_work_item` via Self)
4. Add process status — menu bar icon badge shows process activity (uses `GET /api/events` SSE)
5. Meeting intelligence is one mode; Ditto companion is the always-on state

**What the user gets:**
- Ditto is a persistent macOS citizen — always available, not just during meetings
- Review and approve from desktop without opening browser
- Quick capture work items from anywhere
- Meeting intelligence activates automatically when calls detected

**Engineering effort:** 2-4 weeks beyond Phase 2. Most complexity is in the new SwiftUI views, not in the API integration (which is already working from Phase 2).

### Critical Dependency: What's NOT Needed

This fork does NOT require:
- Building a transcription engine (OpenOats has 6 backends)
- Building audio capture (OpenOats handles mic + system)
- Building a knowledge base (Phase 1 uses OpenOats' local KB; Phase 2 uses Ditto's Self)
- Changing Ditto's web backend (all APIs already exist)
- Building a RAG pipeline (deferred — Self handles knowledge retrieval)
- Cross-platform support (macOS-only is fine for a companion; web app handles other platforms)

### Risk Factors

| Risk | Severity | Mitigation |
|------|----------|------------|
| OpenOats is 28 days old — undiscovered bugs | Medium | Fork gives full ownership; fix issues as found |
| Solo developer upstream — maintenance risk | Low | Fork means Ditto owns the code; upstream is a bonus, not a dependency |
| Swift 6.2 / Xcode 26 requirement | Low | Standard macOS dev toolchain |
| 6 transcription backends = maintenance surface | Medium | Could trim to 2-3 backends (WhisperKit + Parakeet) initially |
| API latency for Phase 2 suggestions | Medium | PreFetchCache (30s TTL) + fallback to local KB when API slow. Timeout threshold and blending strategy TBD in brief. |
| Ditto web app must be running for API | Medium | Phase 1 could queue transcripts locally and sync when available |
| macOS companion API authentication | Medium | No auth mechanism exists for native app → Ditto API. Needs design: API key, token, or local-only (same machine). Affects all phases. |
| App signing and distribution | Medium | ScreenCaptureKit + mic entitlements require Apple notarization. Code signing + distribution (Homebrew tap or DMG) adds effort to every phase. |

### Comparison: Fork OpenOats vs Build from Scratch

| Dimension | Fork OpenOats | Build from scratch |
|-----------|--------------|-------------------|
| Time to Phase 1 | Days | Weeks (audio capture alone is days) |
| Audio capture quality | Proven (71 releases of testing) | Unknown until built |
| Transcription | 6 backends, partial results, VAD | Must integrate WhisperKit or similar |
| Meeting detection | Working | Must reverse-engineer app detection |
| Screen share invisibility | Working | Must discover correct window level |
| Code ownership | Full (MIT fork) | Full |
| Code understanding | Must study ~15K lines of Swift | Built from knowledge |
| Maintenance burden | ~15K lines of someone else's patterns | Only what you write |

---

## Reference Docs Status

- **`docs/landscape.md`:** Updated twice — (1) added OpenOats under new "Meeting Intelligence" section with Swift-native limitation, maturity note, and multi-party gap; (2) updated composition level to dual: "pattern" for TypeScript engine, "adopt" for native macOS companion app.
- **`docs/research/api-to-tool-generation.md`:** No drift found. Browser automation deferral still valid — OpenOats is a different modality (audio, not browser).
- **`docs/research/process-discovery-from-organizational-data.md`:** Meeting transcripts already identified as a data source. OpenOats provides a concrete capture mechanism — no update needed, but worth noting in any future revision.
