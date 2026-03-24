# Insight-083: Knowledge Must Be Visible and Traceable — Not Just Remembered

**Date:** 2026-03-24
**Trigger:** User observation: "As things get decided or begin to form, there is no capture in a documented or structured way... it must be clear they exist and the user should feel confident they are being captured. Currently it is not quick and easy to see how knowledge is actually impacting outputs."
**Layers affected:** L6 Human (all views), L3 Memory, L2 Process, Conversational Self
**Status:** active

## The Two-Sided Problem

### Side 1: Capture — Decisions must become durable documents, not chat history

When a user tells Ditto something important — their brand voice, their pricing rules, their ideal client, their quality standards — this isn't conversation. It's **business knowledge** that must:

1. Exist as a structured, viewable document (not buried in chat)
2. Be editable independently of the conversation that created it
3. Be explicitly referenced by processes that use it
4. Be versioned — the user should know when it was last updated

Think of it as: the conversation is how knowledge gets CREATED. The knowledge base is where it LIVES. Processes are how it gets USED.

The analogy to the Ditto project itself is exact: `personas.md`, `vision.md`, `architecture.md` exist as structured documents. Every dev role reads the relevant ones before doing work. The user never wonders "does the Builder know about the personas?" because the input chain is explicit.

### Side 2: Visibility — The user must SEE knowledge flowing into outputs

Even when knowledge IS captured, the user can't tell if it's being used. This is the Claude project knowledge problem: you add things to the knowledge base, you start a new chat, and you just... hope the AI is using it. There's no signal.

**What "knowledge is being used" looks like to a user:**

- A quote shows: "Used your pricing rules (updated 12 March), bathroom labour rule (22 hrs, from your feedback)"
- A content piece shows: "Written in your brand voice (safe, practical, real) for your audience (first-time mums, 30s, professional)"
- When the user edits a knowledge document, they see: "This is used by 3 processes: Quoting, Content, Follow-ups"
- When a process produces output, the knowledge inputs are visible (not buried, but not noisy — expandable)

### Why This Matters So Much

Chat-based AI tools have trained users to distrust persistence. "Did it actually remember?" is a constant background anxiety. Every AI user has had the experience of correcting something and then seeing the same mistake in a later conversation.

Ditto's promise is that things stick. But SAYING they stick isn't enough. The user needs to SEE them sticking — see the knowledge, see it being referenced, see it improving outputs.

## Design Implications

### 1. Knowledge Documents Are First-Class Objects

Not settings. Not preferences. Not memory entries. **Documents** the user can:
- Browse ("show me everything Ditto knows about my business")
- Read (full text, structured sections)
- Edit directly (not through conversation — though conversation can trigger updates)
- See connections ("used by Quoting, Content, Follow-ups")

### 2. Every Output Shows Its Knowledge Inputs

Not as a wall of citations, but as a collapsible section:

```
Henderson bathroom reno — $15,140
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Based on:
  Pricing: Reece supplier list (updated 12 Mar)
  Labour: 22 hrs — bathroom rule (learned from your feedback)
  Margin: 25% residential
  Customer: New — no history
```

This is not an "evidence trail" feature for power users. This is the TRUST mechanism. Rob sees "bathroom rule (learned from your feedback)" and thinks "it remembered." That moment is worth more than any dashboard metric.

### 3. Knowledge Health is Always Visible

The knowledge health card from prototype 06 was on the right track. But it shouldn't only appear in a knowledge-capture conversation. It should be:
- Accessible from the workspace sidebar ("Your business" or "What I know")
- Summarised in the morning brief when something is stale or missing
- Referenced when the Self asks for information ("I don't have your pricing rules yet — that would help me quote more accurately")

### 4. The "Knowledge Is Being Captured" Signal

During conversation, when the user says something that becomes knowledge, the system should signal it:

- Not a toast notification (too noisy)
- Not nothing (the current chat problem)
- Something like: a subtle "saved" indicator on the message, or the knowledge health card updating in real-time on the side, or a brief Self acknowledgment: "Got it — I've updated your brand voice. This will shape everything I write for you."

The key: the user should never wonder "did the AI actually store that?" They should see it happen.

## Relationship to Other Insights

- **Insight-079** (Process is the product): Knowledge documents are what processes produce and consume
- **Insight-081** (Guided canvas): The information model IS the knowledge-gathering structure
- **Insight-082** (Chat is the seed): Conversation creates knowledge; knowledge feeds processes; processes produce outputs

## Where It Should Land

- **All prototypes** — every output needs a "based on" signal; every knowledge-creating conversation needs a "captured" signal
- **Workspace sidebar** — "What I know" section showing knowledge documents and their status
- **Process detail view** — which knowledge documents this process reads
- **Morning brief** — stale or missing knowledge flagged
- **Component catalog** — knowledge-source-badge, knowledge-health-summary, output-provenance-section
