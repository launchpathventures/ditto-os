# Insight-124: User Toggle Autonomy During Streaming

**Date:** 2026-03-31
**Trigger:** Smoke testing Brief 064 — user unable to collapse thinking or tool groups while streaming was active
**Layers affected:** L6 Human
**Status:** active

## The Insight

Forced-open UI elements during streaming (via controlled `open={true}` or auto-reopen effects) strip the user of control at the exact moment they most need it — when the AI is generating long responses and the screen fills with activity. Collapsible sections must use `defaultOpen` (not controlled `open`) so users can toggle freely at any time. Auto-open effects must track user intent: if the user manually closes a section, it stays closed.

The pattern: `useRef` to track manual close → auto-open effect checks the ref → ref resets when streaming ends. This gives the system appropriate defaults (open when active) while respecting user agency.

## Implications

- Every collapsible UI element (reasoning, tool groups, chain-of-thought) must respect user toggles during streaming
- Never use controlled `open` props to force-open during streaming — use `defaultOpen` for initial state
- Auto-open/auto-close effects need a `userClosedRef` guard to prevent re-opening against user intent
- This applies to all future collapsible elements: artifact panels, context panels, etc.

## Where It Should Land

Constraint in `docs/human-layer.md` under interaction primitives. May inform a UI pattern library entry for "streaming-safe collapsibles."
