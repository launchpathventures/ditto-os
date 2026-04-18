# Dev Review — Exhaustive Post-Coding Audit

**Role:** You are a **paranoid code reviewer** performing a multi-pass audit on every file changed in the current coding session. You are looking for bugs that compile but crash at runtime, integration mismatches, performance traps, and convention drift.

---

## Setup

1. Get the list of all changed and new files:

```bash
git diff --name-only HEAD
git ls-files --others --exclude-standard
```

2. Separate into **new files** and **modified files**
3. Read EVERY file in full — do not skim or skip lines
4. Run all five passes below sequentially

---

## Pass 1: Imports, Types & Compilation

**Goal:** Every import resolves, every type matches, every function signature is correct.

For each file, verify:

| Check | What to look for |
|-------|-----------------|
| **Import resolution** | Every `import { X } from "Y"` — does `Y` exist and export `X`? Check barrel exports (`index.ts`) too |
| **Type compatibility** | Props passed to components match the interface. API request bodies match endpoint expectations. Service method arguments match the signature |
| **Function signatures** | Factory functions called with correct args (e.g. `createModel` needs 2 args not 1). Hooks return the right shape |
| **Barrel export completeness** | New services/types/components exported from module `index.ts` if consumed externally |
| **File headers** | Every new file has `/** CATALYST - {purpose} */` header comment |

### Common bugs caught here:
- Wrong number of arguments to factory functions
- Importing from deep paths when barrel export is available (or vice versa)
- Type narrowing that doesn't actually narrow (`as` casts hiding mismatches)
- Missing re-exports causing "not found" at runtime

---

## Pass 2: Integration & Data Flow

**Goal:** Data flows correctly between components, APIs, and services. No contract mismatches.

For each feature, trace the COMPLETE data flow:

| Check | What to look for |
|-------|-----------------|
| **API contract match** | Client sends `{ propertyIds }` — does the server expect `{ propertyIds }`? Response shape matches what client destructures |
| **API route existence** | Every `fetch("/api/foo")` URL maps to an actual `app/api/foo/route.ts` file |
| **Auth on every endpoint** | Every API route (GET, POST, DELETE) checks `supabase.auth.getUser()`. No unauthenticated endpoints |
| **Database table/column names** | Supabase queries reference real tables and columns. `user_profiles.id` not `contacts.user_id` |
| **Prop threading** | Data fetched in parent is passed to child correctly. Props added to component interfaces are actually passed at call sites |
| **Service → API → UI chain** | If service adds a method, API route exposes it, and UI calls the right endpoint |

### Common bugs caught here:
- Querying the wrong database table (e.g. `contacts` instead of `user_profiles` for agent names)
- API endpoint URL typo (client calls `/api/notes/count` but route is `/api/notes/counts`)
- New prop added to component but parent never passes it (defaults to undefined/0, feature silently disabled)
- Missing auth check on GET endpoints (POST has it, GET doesn't)
- **New branch added to existing function but downstream ops (record, notify, return) gated behind null guards that skip silently** — trace every new code path to confirm all expected side-effects are reachable. Ask "what if this field is null?" at every branch point.

---

## Pass 3: Runtime & State Management

**Goal:** No crashes, no stale state, no infinite loops, no race conditions.

| Check | What to look for |
|-------|-----------------|
| **React hook rules** | No hooks called inside conditions, loops, or callbacks. No hooks after early returns |
| **useEffect dependencies** | Array references (`[matches]`) are stable — not recreated every render. Use memoized keys for object/array deps |
| **Null/undefined access** | `property.id` when `property` could be null. `data.counts` when `data` could be null from a failed fetch |
| **Stale closures** | Callbacks in `useCallback`/`useEffect` that capture old values. Missing deps that should be included |
| **Double-fetch** | Parent and child both fetch the same data independently. Use prop drilling or context instead |
| **Async error handling** | Every `fetch()` has `.catch()` or try/catch. Every `await` is inside a try block. Fire-and-forget promises have `.catch()` |
| **Dynamic imports** | `import("./module").then(...)` has a `.catch()` handler for load failures |
| **Memory leaks** | `useEffect` cleanup for event listeners, timers, subscriptions |
| **Click-outside / Escape** | Custom dropdowns handle click-outside and Escape key to close |

### Common bugs caught here:
- `useEffect` with `[matches]` re-runs every render because `matches` is a new array reference (use `JSON.stringify` or memoized key)
- `usePropertyNotes` called inside every list item component = N+1 API calls
- Parent calls `usePropertyNotes(id)` AND child calls it again = double fetch
- Dynamic import without `.catch()` = silent failure when module can't load
- AI processing blocking the HTTP response (should be fire-and-forget)

---

## Pass 4: Security & Validation

**Goal:** No auth bypasses, no injection, no data leaks.

| Check | What to look for |
|-------|-----------------|
| **Input validation** | API endpoints validate: required fields present, enums match allowed values, strings have length limits |
| **Ownership checks** | Delete/update operations verify the user owns the resource before acting |
| **UI matches server auth** | If server returns 403 for non-owner delete, UI shouldn't show the delete button to non-owners |
| **SQL/RLS policies** | Migration has RLS enabled, policies cover SELECT/INSERT/UPDATE/DELETE, `WITH CHECK` on UPDATE prevents ownership transfer |
| **Prompt injection** | AI prompts separate instructions from user input with clear boundary markers (`<user_input>` tags) |
| **Visibility filtering** | Internal-only data not exposed in public APIs. Public endpoints filter by `visibility = "public"` |
| **Sensitive data in logs** | No passwords, tokens, or PII in `console.error` or `console.log` |

### Common bugs caught here:
- DELETE endpoint checks auth but not ownership — any logged-in user can delete any record
- UI shows delete button for all items, user clicks, gets 403 error (bad UX)
- Missing `WITH CHECK` on UPDATE RLS policy — user could change `agent_id` to take ownership
- Visibility field not validated server-side — client can send `visibility: "anything"`

---

## Pass 5: Performance & UX

**Goal:** No unnecessary fetches, no UI jank, no broken interactions.

| Check | What to look for |
|-------|-----------------|
| **N+1 queries** | Hook called per-item in a list (each item fetches independently). Batch instead |
| **Full table scans** | `table.list()` fetching ALL rows then filtering in memory. Push filters to the database |
| **Unnecessary re-renders** | Unstable deps causing effects to re-run. New object/array references in render |
| **Response time** | Synchronous AI/LLM calls blocking API responses. Should be fire-and-forget or background |
| **Missing loading states** | Async operations without loading indicators |
| **Optimistic updates** | Delete shows success toast but item stays visible until refetch completes |
| **Accessibility** | Icon-only buttons need `aria-label`. Interactive elements need keyboard support |
| **Container queries** | Content inside Shell.Content uses `@lg:` not `sm:` viewport breakpoints |

### Common bugs caught here:
- `usePropertyNotes()` inside every `<MatchPropertyCard>` = 20 parallel API calls for 20 cards
- `countByPropertyIds()` calls `table.list()` which downloads the entire table to count 5 properties
- AI summary generation awaited in POST handler, blocking response for 3-5 seconds
- Delete button on notes not owned by current user — shows button, click fails with 403

---

## Database Migration Checks

If the diff includes SQL migrations, additionally verify:

| Check | What to look for |
|-------|-----------------|
| **`updated_at` trigger** | Every table with `updated_at` column has a trigger calling `update_updated_at_column()` |
| **FK schema qualification** | Foreign keys use `public.table_name(id)` not bare `table_name(id)` |
| **RLS enabled** | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` present |
| **RLS policies complete** | SELECT, INSERT, UPDATE, DELETE policies all defined |
| **UPDATE policy has WITH CHECK** | Prevents ownership transfer via `WITH CHECK (agent_id = auth.uid())` |
| **Composite indexes** | Common query patterns (e.g. `WHERE property_id = ? ORDER BY created_at DESC`) have matching composite indexes |
| **Enum creation** | `CREATE TYPE` before `CREATE TABLE` that uses it |
| **No agency_id** | Per project rules — no `agency_id` column, no multi-tenant patterns |

---

## Output Format

For each issue found:

```
[PASS {N}] {SEVERITY} — {file_path}:{line_number}
{Description of the issue}
{Why it matters}
{Suggested fix (one line)}
```

Severity levels:
- **CRITICAL** — will crash at runtime or cause data loss
- **HIGH** — wrong behavior, security issue, or significant performance impact
- **MEDIUM** — convention violation, minor UX issue, or code smell
- **LOW** — cosmetic, naming, or style issue

---

## Final Steps

1. Run `pnpm run type-check` to confirm no type regressions
2. Summarise: total issues by severity, most critical items, overall assessment
3. If `--fix` was passed, fix all CRITICAL and HIGH issues, then re-run typecheck

### Summary Template

```
## Dev Review Summary

**Files reviewed:** {count}
**Issues found:** {critical} critical, {high} high, {medium} medium, {low} low

### Critical Issues
{list or "None"}

### High Issues
{list or "None"}

### Recommended Actions
{what to fix before shipping}
```
