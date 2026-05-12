# Insight-230: Workspace First-Boot Sentinel Must Cover Seed-Fetch Failure, Not Just Empty Seed

**Date:** 2026-05-12
**Trigger:** Provisioning `launchpath` workspace. The provisioner saga's `waitForDeepHealth` failed at 300s. Root cause was the network's `/api/v1/network/seed` endpoint returning 500 (schema-broken — see Insight-229). The workspace's instrumentation correctly caught the throw and logged it, but **did not write a first-boot sentinel**. `isFirstBoot()` therefore kept returning true, `/api/healthz?deep=true` reported `seed: not_imported` and 503'd, and the saga timed out. PR #48's sentinel writer triggers only when `importSeed` returns 0 memories — which requires a successful seed *response*. It does not trigger when the seed *fetch* fails.

**Layers affected:** L3 Harness (workspace boot lifecycle), L4 Awareness (first-boot detection)
**Status:** absorbed into ADR-025 by Brief 267 (2026-05-12). Managed workspaces now receive `DITTO_WORKSPACE_USER_ID`, seed fetch failure writes a seed-attempt sentinel, provisioning-mode health accepts seed-attempted local boot without requiring Network reachability, and ADR-025 documents seed paths A/B/C.

## The Insight

There are at least three paths through workspace first-boot seed processing, and PR #48 only handles two of them correctly:

| Path | What happens | Current behavior | Should be |
|---|---|---|---|
| **A: Successful import** | Network returns seed with N memories, workspace writes them | Sentinel skipped (N > 0). ✓ | Same. ✓ |
| **B: Empty-but-successful import** | Network returns 200 with 0 memories (new user, no history) | Sentinel written. ✓ | Same. ✓ |
| **C: Seed fetch fails** | Network returns 5xx, 4xx, network down, schema broken, etc. | **No sentinel.** Workspace stays in first-boot forever. ✗ | Sentinel written. |

The asymmetry is invisible from the PR #48 codepath: `fetchAndImportSeed` *throws* on `!response.ok`, so control never reaches the `if (result.memoriesImported === 0)` check that writes the sentinel. The catch block in `instrumentation.ts` swallows the throw, logs "Seed import failed", and the workspace boots into a permanently-degraded state.

The deeper issue is a confusion of intent. The sentinel exists to mark "first-boot seed processing has been attempted and completed for this workspace, regardless of outcome." It's the workspace's way of remembering it tried. Treating "tried and got an empty response" differently from "tried and the network was down" makes the marker useless for its purpose — the workspace re-attempts on every boot, repeatedly failing the same way, and never becomes healthy.

## Implications

1. **The catch block must own the sentinel.** Move the sentinel write into `instrumentation.ts`'s catch — if `fetchAndImportSeed` throws, write a sentinel anyway. The semantic is "we tried, we noted that, do not loop." Inside `fetchAndImportSeed` keep the empty-import sentinel for the success-path zero-memory case.
2. **The workspace must know its userId without depending on a successful seed fetch.** Today the sentinel uses `seed.userId` from the response, which is unavailable on the fetch-failure path. The provisioner should inject `DITTO_WORKSPACE_USER_ID` as an env var so the workspace can write the sentinel scoped to a known user even when the network is unreachable. (`WORKSPACE_OWNER_EMAIL` is set today but is the wrong key — `scopeId` for self-memories is the network userId, not an email.)
3. **Saga health-check semantics need to be more forgiving.** `/api/healthz?deep=true` returns 503 when seed is `not_imported` *or* network is `unreachable`. Both are legitimate states for a freshly-provisioned workspace whose network just happens to be having a bad day. The saga's `waitForDeepHealth` should accept "workspace boots, DB is migrated, sentinel is present" as success — network reachability is a useful signal for monitoring but should not block provisioning. (Provisioning blocks today; once the user is in the workspace, the workspace tolerates network outages just fine.)
4. **Test coverage gap.** `src/engine/network-seed.test.ts` exercises path A (memories imported) and path B (sentinel on empty). Path C (network throws / returns non-2xx) is not exercised. A regression test should assert: when `fetchAndImportSeed` is wired to a fetch that throws, the workspace ends up with a sentinel in the DB.

## Where It Should Land

- **Brief: harden workspace boot's seed catch.** Edit `packages/web/instrumentation.ts` so the catch block writes a sentinel. Add `DITTO_WORKSPACE_USER_ID` env injection in `src/engine/workspace-provisioner.ts`. Add a path-C test in `network-seed.test.ts`.
- **Brief: relax deep-health for provisioner.** Add a `?for=provision` query param (or a `bootstrap` mode) on `/api/healthz?deep=true` that treats `seed: imported-via-sentinel` and `network: unreachable` as 200, not 503. The saga uses this lenient mode; monitoring uses the strict mode.
- **Insight to absorb into ADR-025 (workspace seed contract):** the sentinel is part of the contract, not a fallback. Document path A/B/C explicitly.

## Workaround Used (this session)

Fixing Insight-229 (network DB schema) made path B fire correctly: the workspace successfully fetched an empty seed from the restored network, `writeFirstBootSentinel` ran, the deep health check returned 200, and the saga completed in 41s. The path-C gap is still present — any future network outage during provisioning will reproduce the original failure.
