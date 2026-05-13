# Insight-234: Cross-Deployment Inbox Delivery Needs Durable Pull-and-Ack

**Date:** 2026-05-13
**Trigger:** Brief 259 initially pushed public-profile visitor artifacts through the in-memory Network event stream. Fresh-context review caught that `emitNetworkEvent()` only works inside one deployment process, while `/people/[handle]` runs on the Network Service and the user's Inbox renders inside a separate workspace deployment.
**Layers affected:** L1 Process, L3 Harness, L6 Human
**Status:** active

## The Insight

Any artifact that crosses from the Network Service into a managed workspace must be treated as a durable delivery, not a live UI event. In-memory SSE is useful for same-process invalidation, but it is not a cross-deployment delivery guarantee and cannot be the only path for an authorization request, forwarded note, or review item.

The reliable shape is an outbox-style queue on the sender side plus pull-and-ack on the consumer side. The Network Service persists the self-contained `ContentBlock[]` payload and the target user id. The workspace authenticates with its Network token, imports pending deliveries into its local `activities` table, renders from local state, and ACKs delivery ids back to Network. If the ACK fails after local import succeeds, the next import poll must ACK already-imported rows again.

## Implications

1. **Delivery and rendering are separate contracts.** The Network tier owns "this artifact exists and is addressed to user X"; the workspace owns "this artifact is visible and actionable in the local Inbox."
2. **Workspace review must not depend on a live Network DB read.** This is the operational version of Insight-231: the payload has to validate and render in the consuming deployment using only local state after import.
3. **ACK retry is part of idempotency.** A local dedupe check that skips insertion is not enough; it must still include the delivery id in the ACK batch or the Network queue can remain pending forever.
4. **Authorization outcomes must update the imported artifact.** If an imported `AuthorizationRequestBlock` stays pending after an approve/reject action, the Inbox can resurrect stale decisions after reload.

## Where It Should Land

- `docs/architecture.md` Layer 6 workspace / public profile section: keep `network_workspace_deliveries` as the seed durable-delivery primitive for Network → workspace Inbox artifacts.
- Future Network → workspace briefs: require a sender-side durable outbox, consumer-side local import, idempotent ACK retry, and terminal-state persistence as acceptance criteria.
- `docs/review-checklist.md`: add a cross-deployment delivery check distinct from the existing cross-deployment auth artifact check.
