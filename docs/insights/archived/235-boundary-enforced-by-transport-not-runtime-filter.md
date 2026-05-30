# Insight-235: A boundary enforced by transport is not a runtime filter — annotate the non-enforcing path

**Date:** 2026-05-16
**Trigger:** Brief 280 Dev Reviewer maker-checker review. AC5 ("boundary tests prove workspace tools usable / front-door restricted") was written as if the workspace Self stream applies a runtime tool filter; in reality `selfConverseStream()` passes the full `selfTools` and never calls `filterToolsForContext`/`determineActionContext`. The front-door restriction lives in the separate Network engine (`buildFrontDoorPrompt`), which `/chat` no longer reaches after the IA inversion.
**Layers affected:** L6 Human (the `/chat` surface), L3 Harness / L2 Agent (tool exposure), security boundary
**Status:** absorbed into `docs/architecture.md` Action-boundaries section (Insight-235 paragraph), `docs/human-layer.md` boundary-is-transport-level section, `docs/dev-process.md` brief-writing rule, `docs/review-checklist.md` item 18. Archived 2026-05-19.

## The Insight

When a capability/security boundary is enforced by **which engine or endpoint a surface talks to** (transport/routing) rather than by a **runtime filter on the call path**, the boundary's *existence as a table or test* can mislead a future reader into believing a runtime check guards every path. It does not. The path that does not consult the boundary table is safe only by construction — because it was wired to an endpoint that is, by definition, the privileged context.

Brief 280's actual guarantee is: "the workspace surface no longer hits the Network engine, so it is workspace context by construction." That is *sufficient and correct*, but it is a different mechanism from "the Self stream filters its tools per context." The `action-boundaries` table is the contract the Network front door enforces; the workspace Self stream is unfiltered on purpose.

The failure mode is not a bug — it is a documentation/comprehension hazard. A maintainer adding a tool, or reasoning about front-door safety, may assume `action-boundaries` gates `/api/chat` and either (a) rely on a check that isn't there, or (b) "fix" the perceived gap by adding a redundant filter that obscures the real invariant.

## Implications

- **Annotate the non-enforcing seam.** Where a privileged path passes the full toolset without consulting the boundary table, leave a comment at that exact line stating the guarantee is transport-level and pointing to where the boundary *is* enforced. (Done: `self-stream.ts` `tools: selfTools` call site.)
- **Write acceptance criteria to the enforcement mechanism, not a plausible-sounding proxy.** "Boundary tests prove the table is internally consistent AND the workspace surface is wired to the workspace endpoint (not the front-door engine)" is the honest framing. A boundary-table unit test alone does not prove runtime enforcement on a path that never calls the table.
- **Reviewers should locate the enforcement seam, not just confirm a table exists.** Trace from the surface to the actual decision point; verify the path under review reaches it.

## Where It Should Land

Brief-writing guidance (Architect): when an AC asserts a safety boundary, require the AC to name the *enforcement seam* and the test to exercise *that seam* (or the routing invariant), not a proxy table. Candidate for a constraint line in `docs/dev-process.md` (briefing system) and a note in `docs/architecture.md` where action boundaries / front-door vs workspace context are described.
