# ADR-023: Artifact Interaction Model

**Date:** 2026-03-27
**Status:** accepted
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
  artifactType: "document" | "spreadsheet" | "image" | "preview" | "email" | "pdf";  // Updated by Addendum Section 13

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

### 2. Artifact Mode Layout

When an artifact is in focus, the workspace layout transitions from the standard three-column (sidebar + centre + context) to an artifact-optimised three-column layout:

**Standard mode:** Sidebar (240px) | Centre content (flex) | Ditto Context (320px)
**Artifact mode:** Conversation (300px) | Artifact (centre, flex) | Ditto Context (320px)

The sidebar **collapses** (icon rail at 56px or fully hidden). The conversation thread slides into the left column. The artifact takes the dominant centre. The context panel **stays put** — it never disappears.

**Left column — Conversation (300px fixed):** Compact refinement thread. Messages during artifact editing are short instructions ("use Q4 rates", "punchier caption"). Input bar at bottom.

**Centre column — Artifact (flex, min 480px):** The dominant surface. Type-specific rendering via six universal viewers (see Addendum Section 8):
  - `document`: Rich formatted text with sections. Max-width 720px.
  - `spreadsheet`: Interactive table with sort, filter, inline edit, CRUD.
  - `image`: Gallery with zoom, compare, carousel navigation.
  - `preview`: Running HTML/app in sandboxed iframe (dashboards, forms, presentations).
  - `email`: Email preview (To, Subject, Body as recipient sees it). Max-width 640px.
  - `pdf`: Page-faithful rendering with navigation, zoom, annotations.

Includes version bar, provenance strip, and action footer (Approve, Send, Download — sticky, always visible).

**Right column — Ditto Context (320px, collapsible):** Shows why you should trust this output:
- **Knowledge used** — sources that informed the artifact
- **Process context** — which process, what step, what trust level
- **Related items** — other artifacts from same process run
- **Version history** — v1 → v2 → v3 with change summaries
- **Teach-this prompts** — when the system spots a learnable pattern

User can dismiss the context panel (chevron/collapse icon) for wider artifact editing. Artifact expands to fill.

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
  type: "document" | "spreadsheet" | "image" | "preview" | "email" | "pdf";  // Updated by Addendum Section 13
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

// Superseded by Addendum Section 13 — see updated ArtifactContent union below
type ArtifactContent =
  | { type: "document"; body: string; format: "markdown" | "html" }
  | { type: "spreadsheet"; schema: SpreadsheetSchema; rows: Record<string, unknown>[] }
  | { type: "image"; items: Array<{ url: string; alt: string; width?: number; height?: number }> }
  | { type: "preview"; html: string; css?: string; js?: string; sandboxUrl?: string }
  | { type: "email"; to: string; cc?: string; subject: string; body: string; signature?: string }
  | { type: "pdf"; url?: string; binary?: string };
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
| `.impeccable.md` | Artifact Mode layout section added: sidebar collapses, conversation slides left (300px), artifact takes centre (flex), context panel stays right (320px, collapsible). Rendering follows cardless typographic flow. |

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

---

## Addendum: Viewer Taxonomy (2026-03-27)

**Trigger:** Stress test of Act 5 prototypes revealed the original 7 artifact types mixed viewer types (document, image) with domain types (content, code) and composition types (package). Insight-104 captures the full analysis.

### 8. Six Universal Viewers Replace Seven Artifact Types

The original `artifactType` enum (`document | content | image | code | email | data | package`) is replaced by six **viewer types** — defined by how the user views and interacts with the output, not by what domain it comes from.

| Viewer | Type key | What the user sees | Interaction | Engine content |
|--------|----------|-------------------|-------------|----------------|
| **Document** | `document` | Rich formatted text with sections | Read, edit sections, approve | Markdown or structured sections |
| **Spreadsheet** | `spreadsheet` | Structured rows/columns | Sort, filter, inline edit, CRUD | Schema + rows (JSON) |
| **Image** | `image` | Visual media (single or carousel) | Zoom, compare, navigate slides | URL(s) + alt text + dimensions |
| **Live Preview** | `preview` | Running HTML/app in sandboxed iframe | Interact with result, request changes | HTML/CSS/JS bundle or URL |
| **Email** | `email` | Mail as recipient would see it | Review tone, edit, approve to send | To/CC/Subject/Body/Signature |
| **PDF** | `pdf` | Page-faithful document rendering | Review layout, annotate, approve | Binary content or URL reference |

**What changed and why:**

| Old type | New mapping | Rationale |
|----------|------------|-----------|
| `code` | `preview` | End users don't see source code. They see the running result — website, dashboard, form, presentation. "View Source" is a secondary developer action. |
| `content` | Absorbed into `image` or `document` | "Content" was a domain category, not a viewer. Social posts are Images. Written content is Documents. |
| `package` | Removed as viewer | Package is a composition pattern (a group of artifacts, each with its own viewer). Handled by the multi-part deliverable protocol (Section 4), not a viewer type. |
| `data` | `spreadsheet` | Renamed to match user mental model. Gains CRUD and schema evolution for user-defined databases. |
| — | `pdf` (new) | Documents reflow; PDFs preserve exact page layout. Fundamentally different rendering (PDF.js vs markdown). Contracts, compliance docs, print-ready outputs need page fidelity. |

### 9. Two-Tier Viewer Architecture

The six viewers split into two tiers:

**Structured viewers** (5) — the engine produces structured data, the viewer renders it deterministically. No code generation needed. Cover ~80% of outputs.

| Viewer | Engine produces | Viewer renders |
|--------|----------------|---------------|
| Document | `{ sections: [{ heading, body }] }` | Formatted HTML with typography |
| Spreadsheet | `{ schema: [...], rows: [...] }` | Interactive table with sort/filter/edit |
| Image | `{ urls: [...], alt, dimensions }` | Gallery with zoom/compare/carousel |
| Email | `{ to, cc, subject, body, signature }` | Mail-client preview |
| PDF | `{ url }` or `{ binary }` | PDF.js with page navigation |

**Programmable viewer** (1) — the meta dev process vibe-codes HTML/CSS/JS that runs in a sandboxed iframe. Handles the ~20% that needs interactivity: dashboards, presentations, forms/surveys, calendars, kanban boards, custom tools.

| Viewer | Engine produces | Viewer renders |
|--------|----------------|---------------|
| Live Preview | `{ html, css?, js? }` or `{ url }` | Sandboxed iframe |

**Guidance — when to use which tier:**

- Text-based output → Document
- Rows and columns → Spreadsheet
- Visual media → Image
- Outbound message → Email
- Page-faithful → PDF
- **Only use Live Preview when the output requires interactivity the structured viewers can't provide**

### 10. Templates: Process-Specific Customization

Viewers are universal primitives. **Templates** customise how a viewer renders for a specific process. The meta dev process creates and evolves templates.

| Template | Viewer | Example |
|----------|--------|---------|
| Rob's quote layout | Document | Logo, line items, margin calculation, terms |
| Jay's clinical notes | Document | Assessment, Findings, Plan, Follow-ups sections |
| Jay's blood panel | Spreadsheet | Ranges, flags, colour-coded status badges |
| Rob's business email | Email | Branding, signature, tone rules |
| Rob's invoice | PDF | Exact invoice format with page breaks |
| Lisa's engagement dashboard | Live Preview | Vibe-coded charts + KPIs |
| Libby's client intake form | Live Preview | Vibe-coded form with validation |
| Lisa's slide presentation | Live Preview | Vibe-coded reveal.js slides |

Templates are process definition artifacts — they live in the process definition's output section and are created/evolved by the meta dev process through conversation.

### 11. Spreadsheet Viewer: User-Defined Databases

The Spreadsheet viewer handles both process outputs (reconciliation results, analysis tables) and **user-defined databases** (contacts, leads, properties). The distinction:

| Concern | Who handles it | How |
|---------|---------------|-----|
| Schema definition | Self + engine | User describes in conversation ("I need to track my leads"). Self infers schema from industry patterns + user description. |
| Schema evolution | Self + engine | User says "add a phone field." Self adds nullable column, existing rows get blank. Additive = automatic. Destructive (remove, type change) = Self confirms impact first. |
| Data display + CRUD | Spreadsheet viewer | Sort, filter, inline edit, add/delete rows. Standard table interaction. |
| Relationships | Self + engine | Simple references only ("link leads to properties" = reference field). No complex relational modelling. Self resolves for display. |
| Views | Self + engine | Saved filter/sort configurations. One underlying dataset, multiple named views. |

**Simplicity rule:** Schema evolution is always conversational. No schema editor, no field-type picker, no relationship diagram. The user talks, the Self does it. Non-technical people never see "schema" — they see "your leads list" and say "add a column for site address."

### 12. Knowledge Base Unification

Artifacts, user databases, and uploaded files all converge into **one knowledge layer**. Viewers are the universal interaction layer for all knowledge in Ditto.

| Item | How it enters knowledge | Viewer | How it's reused |
|------|------------------------|--------|----------------|
| Process output (Henderson quote) | Process produces it | Document | Self references margin in future quotes |
| Uploaded file (supplier price list) | User drops it in | PDF | Process uses for pricing, Self alerts on changes |
| User database (Rob's leads) | User defines through conversation | Spreadsheet | Self suggests follow-ups, processes trigger on status change |
| Generated images (Libby's carousel) | Process produces them | Image | Self learns brand palette, other processes reuse assets |
| Vibe-coded tool (Lisa's dashboard) | Meta dev process builds it | Live Preview | Process updates data, Self references metrics |
| Drafted email (Henderson follow-up) | Process drafts it | Email | Self learns tone preference, tracks communication |

**AI-readable companion files:** Alongside each knowledge item, the engine maintains an optimised text extraction (markdown or structured memory file) that supports the Self's ability to search, reference, and reason about the item — regardless of its viewer type. PDFs get text extraction. Images get alt text + context. Live Previews get a structured description. Spreadsheets get schema + summary stats. This ensures every knowledge item is AI-accessible, not just human-viewable.

### 13. Updated Engine Types

Replaces Section 7's type definitions:

```typescript
interface Artifact {
  id: string;
  processRunId?: string;           // null for uploaded/user-created items
  viewerType: "document" | "spreadsheet" | "image" | "preview" | "email" | "pdf";
  title: string;
  versions: ArtifactVersion[];
  status: "draft" | "approved" | "sent" | "rejected" | "living";  // "living" for databases
  destination?: { label: string; type: string };
  knowledgeUsed: string[];
  provenance: string[];
  templateId?: string;             // process-specific template
}

interface ArtifactVersion {
  version: number;
  content: ArtifactContent;
  createdAt: string;
  changedSummary?: string;
  aiCompanion?: string;            // markdown extraction for AI search/reasoning
}

type ArtifactContent =
  | { type: "document"; body: string; format: "markdown" | "html" }
  | { type: "spreadsheet"; schema: SpreadsheetSchema; rows: Record<string, unknown>[] }
  | { type: "image"; items: Array<{ url: string; alt: string; width?: number; height?: number }> }
  | { type: "preview"; html: string; css?: string; js?: string; sandboxUrl?: string }
  | { type: "email"; to: string; cc?: string; subject: string; body: string; signature?: string }
  | { type: "pdf"; url?: string; binary?: string };  // binary = base64 for generated PDFs

interface SpreadsheetSchema {
  columns: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "date" | "enum" | "reference" | "boolean";
    options?: string[];             // for enum type
    referenceTable?: string;        // for reference type — artifact ID of related spreadsheet
    required?: boolean;
  }>;
}
```

**ArtifactBlock update** (Section 1):

```typescript
// Replace artifactType in ArtifactBlock:
artifactType: "document" | "spreadsheet" | "image" | "preview" | "email" | "pdf";
```

### 14. Updated Prototype Coverage

One prototype per viewer type. Each demonstrates the viewer, not a scenario.

| Prototype | Viewer | Test case | Persona |
|-----------|--------|-----------|---------|
| P36 | Document | Rawlinsons cost estimate — generate, refine, approve | Rob |
| P37 | Image | Steven Leckie Instagram carousel — generate, refine colour, approve | Lisa |
| P38 | Live Preview | Abodo reconciliation dashboard — vibe-coded, interactive | Nadia |
| P39 | Email | Henderson follow-up — draft, tone adjust, send | Rob |
| P40 | Spreadsheet | Jay's blood panel + patient database — view results, CRUD | Jay |
| P41 | PDF | Contract/compliance document — page-faithful review, annotate | Rob |

**Dropped from prototype set:**
- P37 Content Pack → pack is a composition of viewers, not a viewer itself. Demonstrate via batch protocol on P37 Image.
- P40 Clinical Notes as Document → already covered by P36 Document (clinical notes ARE documents).
- P38 Code → replaced by Live Preview (user sees running result, not source).

### 15. Live Preview Security

The programmable viewer runs user-generated or meta-dev-process-generated code in a **sandboxed iframe**:

- `sandbox="allow-scripts"` — no `allow-same-origin`, no `allow-top-navigation`
- Strict CSP: `script-src 'unsafe-inline'` only (no external script loads)
- No access to parent window, cookies, or localStorage
- Communication via `postMessage` only (for action callbacks)
- Size-limited: HTML/CSS/JS bundle max 2MB
- Provenance: Claude Artifacts pattern (Anthropic), CodePen embed model

This is the same security model used by Claude Artifacts and every online code playground.

### Provenance

- **Viewer taxonomy (6 types):** Original — derived from stress-testing all persona outputs against interaction models. No existing framework uses this exact taxonomy.
- **Two-tier architecture:** Pattern from Claude Artifacts (structured components + freeform HTML preview).
- **Spreadsheet as database:** Pattern from Notion databases and Airtable — schema stored as metadata, rows as JSON, evolution via conversation.
- **AI companion files:** Pattern from RAG architectures — maintain searchable text alongside binary/visual content.
- **Live Preview sandbox:** Pattern from Claude Artifacts (Anthropic), CodePen, JSFiddle — sandboxed iframe with CSP.
