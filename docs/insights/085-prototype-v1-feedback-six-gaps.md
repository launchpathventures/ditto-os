# Insight-085: Prototype V1 Feedback — Six Design Gaps

**Date:** 2026-03-24
**Trigger:** User review of P08-P20 prototype journey
**Layers affected:** L6 Human (all views)
**Status:** active — drives v2 refinement pass

## The Six Gaps

### 1. Chat input must be persistent bottom-centre

Every AI product has established the bottom-centre input as the universal interaction pattern: Cockpit, Claude, ChatGPT, OpenClaw. Ditto moved it to a right panel, which breaks the convention and makes it feel like a secondary feature.

**Fix:** The chat input bar is a persistent bottom-centre element on EVERY view. It floats above the content. The Ditto conversation history can still live in a panel, but the INPUT is always bottom-centre. This is the "I can always talk to Ditto" signal.

### 2. Sidebar lost the Paperclip task/goal/process hierarchy

The current sidebar is a flat list of items and processes. Paperclip showed that users need to see the STRUCTURE of their work — goals that contain tasks, processes that group into functional areas. The flat list doesn't convey structure or relationships.

**Fix:** Sidebar shows a hierarchy:
- **Workspaces** (top-level — Tim's clients, Rob's business, Libby's brand)
- **Functional areas** (or goals) within a workspace
- **Processes** within each area
- **Active items** within each process (with counts/status)

### 3. No org structure — processes don't map to business functions

There's no way to see how processes relate to each other or map to functional areas of the business. Jordan has 4 processes across 3 departments but they're all in a flat list. Nadia can't see her team's process structure.

**Fix:** A process/org view that shows:
- Functional grouping (HR, Finance, Ops — or Quoting, Delivery, Admin)
- Process relationships (quoting feeds follow-ups, follow-ups feed invoicing)
- Agent assignments per process
- Trust levels per process at a glance

### 4. Too feed-like — not using full width when content demands it

Single-column feed is the default for everything. But a quote review with details deserves multi-column. A process graph should be spatial. A knowledge base should use the width. The layout should adapt to WHAT'S BEING SHOWN, not always be a vertical scroll.

**Fix:** Content-adaptive layouts:
- **Feed** for morning brief, activity updates (vertical scroll, single column)
- **Detail view** for quote review, output review (multi-column, full width)
- **Spatial view** for process graph, org structure (canvas-like)
- **Document view** for knowledge base, strategy docs (wide, structured)

### 5. Not clear what I should be doing

Despite the morning brief and feed cards, the user still isn't sure what the SINGLE most important thing is. Too many cards with similar visual weight. The priority signal is diluted.

**Fix:** One unmistakable "your next move" element:
- At the top of the feed, not buried in cards
- Visually distinct — not just another card
- Actionable in one tap/click
- After acting, the next priority surfaces automatically

### 6. No multi-workspace model

Tim has 5 clients plus family plus micro-school. Libby has her business plus mum life. There's no way to see or switch between these contexts. No workspace concept at all.

**Fix:** Top-level workspace switcher:
- In the sidebar header or as a dropdown
- Each workspace has its own processes, knowledge, and context
- Cross-workspace morning brief (Tim sees all clients in one view)
- Clean context switching — when in "Client A" workspace, everything is scoped to that context

## What To Rework

P13 (daily workspace) is the primary target — it's the screen users spend 80% of their time on. If it doesn't work, nothing else matters. Rework P13 to address all six gaps, then propagate the patterns to other prototypes.

## Where It Should Land

- P13 v2 — the flagship rework
- All prototypes — persistent bottom-centre chat input
- Sidebar pattern — hierarchy, not flat list
- New prototype needed — process/org view (process graph mapped to business functions)
