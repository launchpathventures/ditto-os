# ADR-023: Artifact Interaction Model

**Date:** 2026-03-27
**Status:** proposed
**Layers affected:** L2 Agent (Self emits artifact references), L3 Harness (artifact lifecycle management), L6 Human (right panel becomes artifact workspace)

## Context

ADR-021 defined 21 content block types for the Self's conversational output. These blocks handle information display, review actions, structured input, and progress — but they assume the conversation stream IS the content surface.

Real-world process outputs are **artifacts** — deliverables that need iterative refinement, not one-shot review:

| Test case | Artifact | Interaction |
|-----------|----------|-------------|
| Rawlinsons | Cost estimate PDF | "The copper rate seems high, use Q4 rates" → estimate updates |
| Steven Leckie | Instagram post + caption | "Make the caption punchier" → caption rewrites |
| Steven Leckie | Content pack (6 pieces) | Review each piece, approve independently |
| Delta Insurance | Underwriting triage report | "Flag the flood exposure" → report restructures |
| FICO Capital | Application package (12 docs) | "Client sent updated passport" → package updates |
| Abodo Wood | Quote from architectural plans | "Add timber grade field mapping" → quote recalculates |
| Jay/Status | Clinical session notes | "Move cortisol observation to assessment" → notes reorganize |
| Libby | Brand voice guide | "More conversational tone" → guide rewrites |

The current prototype set only shows text content (social media posts) reviewed inline. No document generation, no image artifacts, no code output, no multi-part deliverables. More critically: no iterative refinement — just approve/reject.

### The Vibe-Coding Insight

Modern AI creation tools (Claude Artifacts, Cursor, Lovable, Bolt) established a pattern: **conversation on the left, live artifact preview on the right, iterating through dialogue.** The user never opens an editor or fills in a form — they describe what they want changed, and the artifact updates.

This is exactly how Ditto's artifact refinement should work. The conversation IS the editing interface. The right panel IS the live preview.

### Forces

- Artifacts need **identity** — the Inbox, Work, and conversation must all reference "the Henderson quote" as one thing
- Artifacts need **versioning** — "v2 with your margin adjustment" vs "v1 original"
- Artifacts need **iteration** — multiple rounds of conversational refinement, not one-shot approval
- Artifacts need **type-specific rendering** — a PDF preview, an image in a phone frame, syntax-highlighted code, an email as the recipient would see it
- The conversation stream must stay readable — full artifact content inline creates scroll bloat
- Mobile must work without a right panel — full-screen preview with swipe-back
- Multi-part deliverables (content packs, application packages) need both individual and batch review
- The right panel (320px per `.impeccable.md`) serves double duty: context AND artifact workspace

### What Existing Blocks Can and Cannot Do

**Can do:** Render artifact *content* — DataBlock for tables, ImageBlock for images, CodeBlock for code, TextBlock for formatted text. The content primitives are complete.

**Cannot do:**
1. **Group blocks as one deliverable** — 4 blocks in a stream have no boundary, no shared identity
2. **Connect actions to content** — "Approve" button scrolls away from what it approves
3. **Support iterative refinement** — no version tracking, no diff, no "what changed"
4. **Render in the right panel** — no block type signals "show this in the artifact workspace"
5. **Express destination** — no way to say "this gets emailed to Henderson when approved"

**ReviewCardBlock** was a prototype-era shortcut — it jams everything into `outputText: string`. It cannot hold a PDF, image, code file, or structured document. It doesn't support versioning, destination, or iterative refinement.

## Decision

### 1. Add ArtifactBlock to the Content Block Vocabulary

ArtifactBlock is a **compact reference** in the conversation stream, not a full content container. The actual artifact content is rendered by the right panel.

```typescript
export interface ArtifactBlock {
  type: "artifact";

  // Identity
  artifactId: string;             // addressable across surfaces

  // Header
  title: string;
  subtitle?: string;              // "Quoting · v2" or "Sent to Henderson"
  artifactType: "document" | "content" | "image" | "code" | "email" | "data" | "package";

  // Status
  status?: {
    label: string;                // "Draft", "Ready", "Sent", "Approved"
    variant: "positive" | "caution" | "negative" | "neutral" | "info";
  };
  confidence?: "high" | "medium" | "low" | null;

  // Summary (what the user sees in conversation — NOT the full content)
  summary?: string;               // "Materials $11.2k · Margin 9% · Total $18.4k"
  changed?: string;               // "Updated margin from 7.6% to 9%"

  // Versioning
  version?: number;

  // Destination
  destination?: {
    label: string;                // "Email to Henderson" / "Instagram Thu 2pm"
    type: "email" | "publish" | "integration" | "download" | "filing";
  };

  // Actions
  actions?: ActionDef[];          // Approve, Edit, Regenerate, Download, Send
}
```

**What ArtifactBlock does NOT contain:** The actual artifact content. No nested `content: ContentBlock[]`. The content lives in the artifact store and is rendered by the right panel. This keeps the conversation stream compact and avoids the scroll-separation problem.

### 2. Right Panel: Two Modes

The right panel (Ditto panel, 320px) gains a second mode:

**Context mode** (existing): Shows Ditto's thinking, knowledge citations, process detail. Active when no artifact is focused.

**Artifact mode** (new): Shows the live artifact being created or refined. Active when an ArtifactBlock is the current focus. Includes:

- **Artifact renderer** — polymorphic, adapts to artifactType:
  - `document`: Formatted HTML preview of the document (what the PDF will look like)
  - `content`: Content preview (social post in phone frame, listing in template)
  - `image`: Image viewer with zoom
  - `code`: Syntax-highlighted editor
  - `email`: Email preview (To, Subject, Body as recipient sees it)
  - `data`: Interactive table / spreadsheet view
  - `package`: Tabbed view of component documents with completion status

- **Version bar** — v1 / v2 / v3 toggle with diff highlighting
- **Provenance strip** — "Based on: PlaceMakers prices, Henderson specs, your margin rules"
- **Action footer** — Approve, Send, Download (sticky, always visible)

The right panel may need to expand wider for artifact editing (480px or full half-screen). This is a surface decision, not a protocol decision.

### 3. Artifact Lifecycle in Conversation

An artifact passes through three states in the conversation stream:

**Created** — First appearance. Full reference card with summary and "Review" action.
```
Ditto: I've prepared the Henderson bathroom quote.

  [● Henderson bathroom quote · v1 · Draft]
  Materials $11.2k · Labour $5.8k · Margin 7.6% · Total $18.4k
  → Email to Henderson when approved
  [Review]  [Approve & Send]

  Based on PlaceMakers prices (Mar 25), Henderson specs,
  your margin rules.
```

**Updated** — After conversational refinement. Compact diff summary.
```
User: "Make margin 9% — we always charge more for bathroom work"

Ditto: Updated the Henderson quote.

  [● Henderson bathroom quote · v2 · Draft]
  Margin: 7.6% → 9% · Total: $18,400 → $18,680
  [Approve & Send]
```

**Resolved** — After approval/send/rejection. Collapsed status line.
```
  [✓ Henderson bathroom quote · Sent to Henderson via email]
```

### 4. Multi-Part Deliverables

A process run that produces multiple artifacts (Steven Leckie's 6-piece content pack):

**In conversation:** RecordBlock as set header + individual ArtifactBlocks.
```
Ditto: Content pack ready for Marina Bay Tower — 6 pieces.

  [Content Pack · 4/6 approved]
  Listing ✓ · Post 1 ✓ · Post 2 ✓ · Post 3 ✓ · Video script ⟳ · Email ⟳

  [● Video script · v1 · Draft]
  60-second walkthrough script, luxury tone
  [Review]

  [● Email blast · v1 · Draft]
  Property alert to 340 subscribers
  [Review]
```

**In right panel:** Tabbed view when the pack header is focused. Individual artifact view when a specific piece is focused.

**Batch actions:** "Approve remaining (2)" on the pack header approves all un-reviewed pieces.

### 5. Conversational Refinement Protocol

When the user sends a message while an artifact is in focus (shown in right panel), the Self treats it as a refinement instruction:

1. Self receives user message + context that artifact X is in focus
2. Self interprets the message as a refinement instruction for artifact X
3. Self produces updated artifact content → stored in artifact store
4. Self emits an ArtifactBlock with incremented version and `changed` summary
5. Right panel updates to show the new version
6. Previous version remains accessible via version bar

The Self uses the same `selfConverseStream` — no new API. The artifact focus context is passed as part of the surface state.

**Refinement vs new conversation:** If the user's message is clearly not about the artifact ("What's on my inbox?"), the Self treats it as a new conversation turn and the artifact stays in the right panel but conversation continues normally. The Self's attention model (ADR-011) handles this disambiguation.

### 6. Mobile Behaviour

No persistent right panel on mobile. Instead:

1. **Artifact reference in conversation** — same compact card as desktop
2. **Tap to preview** — full-screen artifact view (swipe back to conversation)
3. **Refine from conversation** — type refinement, preview updates when re-opened
4. **Approve from either surface** — action buttons on both the conversation card and the full-screen preview

### 7. Engine Representation

Artifacts are stored in the engine as process run outputs (ADR-009 output schema):

```typescript
interface Artifact {
  id: string;
  processRunId: string;
  type: "document" | "content" | "image" | "code" | "email" | "data" | "package";
  title: string;
  versions: ArtifactVersion[];
  status: "draft" | "approved" | "sent" | "rejected";
  destination?: { label: string; type: string };
  knowledgeUsed: string[];        // IDs of knowledge items used
  provenance: string[];           // human-readable source descriptions
}

interface ArtifactVersion {
  version: number;
  content: ArtifactContent;       // the actual content — type-specific
  createdAt: string;
  changedSummary?: string;        // "Margin adjusted from 7.6% to 9%"
}

type ArtifactContent =
  | { type: "document"; sections: { heading: string; body: string }[] }
  | { type: "content"; text: string; imageUrl?: string; metadata?: Record<string, string> }
  | { type: "image"; url: string; alt: string; dimensions?: { width: number; height: number } }
  | { type: "code"; language: string; source: string }
  | { type: "email"; to: string; subject: string; body: string }
  | { type: "data"; format: "table" | "key_value"; data: Record<string, unknown>[] | Record<string, string> }
  | { type: "package"; components: { artifactId: string; title: string; status: string }[] };
```

The ArtifactBlock in conversation is a VIEW of this engine entity — it reads from the artifact store, not the other way around.

## Relationship to Existing Architecture

| Component | Relationship |
|-----------|-------------|
| **ADR-021 Surface Protocol** | ArtifactBlock is a new content block type (22nd). Follows the same discriminated union, exhaustiveness check, and per-surface renderer pattern. |
| **ADR-009 Process Outputs** | Artifact entity maps directly to the output schema's `type: document \| data \| integration \| external`. ArtifactBlock is how process outputs reach the user. |
| **ADR-011 Attention Model** | Artifact focus is attention state. The Self knows which artifact is in the right panel and interprets messages accordingly. |
| **ReviewCardBlock** | Deprecated over time. ReviewCardBlock is a special case of ArtifactBlock where content is plain text and there's no versioning or destination. Keep for backward compat during transition. |
| **RecordBlock** | Not replaced. RecordBlock describes entities (inbox items, tasks, knowledge entries). ArtifactBlock describes deliverables (process outputs for review and delivery). Different concepts. |
| `.impeccable.md` | Right panel gains artifact mode. May need width flexibility (320px for context, wider for artifact editing). Rendering follows cardless typographic flow — bordered flow region, not a card. |

## Consequences

**Positive:**
- Conversation becomes the universal editing interface — no separate editor UX to build
- Right panel serves double duty (context + artifact workspace) without new screens
- All artifact types (document, image, code, email, data, package) use one interaction model
- Versioning is built in — every refinement creates a trackable version
- Mobile works naturally — full-screen preview on tap, same conversational refinement

**Negative:**
- Right panel now has two modes — mode switching adds complexity
- Artifact store is a new engine entity — needs persistence, versioning, cleanup
- Self must disambiguate "refining current artifact" from "new conversation topic"
- Multi-part deliverables (6+ artifacts) may overwhelm the conversation stream

**Risks:**
- Right panel width (320px) may be too narrow for document/code editing — may need responsive expansion
- Conversational refinement could produce excessive versions (v1 through v15) — need version squashing or summary
- Artifact rendering is polymorphic (7 types) — each needs its own right-panel renderer

## Prototype Coverage Needed

| Prototype | Artifact type | Test case | Priority |
|-----------|--------------|-----------|----------|
| **New** | Document | Rawlinsons cost estimate — iterative refinement | P0 |
| **New** | Content (multi-part) | Steven Leckie content pack — 6 pieces, individual review | P0 |
| **New** | Image | Steven Leckie Instagram graphic — image + caption refinement | P1 |
| **New** | Code | Abodo ERP integration config — code with field mappings | P1 |
| **New** | Email | Outbound email draft — tone refinement | P1 |
| **New** | Clinical notes | Jay session notes from voice transcription | P2 |
| **New** | Package | FICO application package — 12 component documents | P2 |

These prototypes should show the full interaction loop: initial generation → conversational refinement (2-3 rounds) → approval → delivery. Not just the final state.
