# Insight-122: E2E Tests Must Match User Flow, Not Assume Layout

**Date:** 2026-03-31
**Trigger:** Brief 057 — all 14 e2e tests broke when Day Zero page was introduced, plus `waitForLoadState("networkidle")` timed out from React Query polling
**Layers affected:** L6 Human (testing infrastructure)
**Status:** active

## The Insight

E2e tests that assume a specific page state on navigation (e.g., "visiting `/` shows chat input") are brittle to user flow changes. Brief 057 introduced a Day Zero welcome page that intercepts first-time visitors before they reach the workspace — every workspace-focused test broke instantly.

Two related sub-patterns emerged:

1. **Flow bypass, not flow ignorance.** Tests that need to reach the workspace must explicitly bypass intermediate screens (set `ditto-day-zero-seen` in localStorage via `addInitScript`). Page objects are the right place for this — they encapsulate flow assumptions.

2. **Wait for elements, not network silence.** `waitForLoadState("networkidle")` is unreliable for SPAs with persistent polling (React Query, SSE, WebSocket). Waiting for a specific data-testid (`chat-input`, `center-panel`) is both faster and deterministic.

## Implications

- Every new user flow gate (onboarding, feature flags, etc.) must come with a corresponding test bypass helper
- Page objects should own flow assumptions so spec files stay focused on assertions
- `networkidle` should never be used in Ditto e2e tests — always wait for a specific element

## Where It Should Land

Testing conventions section of `docs/dev-process.md` when one exists. Meanwhile, the pattern is established in the page objects and can be followed for future tests.
