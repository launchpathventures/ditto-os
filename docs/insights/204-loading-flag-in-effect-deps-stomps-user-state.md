# Insight-204: Loading Flag in Effect Deps Stomps User-Visible State

**Date:** 2026-04-21
**Trigger:** Brief 211 — workspace ChatPanel wiped streamed messages the instant stream completion flipped `loading` false. The reset effect had `[active?.id, loading]` deps and re-fired at the false transition, re-applying a stale `initialMessages` snapshot.
**Layers affected:** L6 Human (any React surface that uses a streaming SDK or async-status flag)
**Status:** active

## The Insight

Any React `useEffect` that mutates **user-visible state** (e.g. `setMessages`, `setForm`, `setSelection`) and lists a `loading` / `status` / `isPending` flag in its deps will stomp that state at the false→true→false transition. The guard `if (loading) return;` at the top of the effect is necessary but not sufficient: listing `loading` in deps guarantees the effect runs the moment the guard releases, and whatever state the effect applies at that moment will fight the streaming / async result that just finished writing.

The correct pattern separates two concerns:
- **What triggers the reset** (thread id change, route change, user action) → belongs in deps
- **When the reset is safe to apply** (not mid-stream) → guard with `if (loading) return;` AND remember the pending apply via a `ref`, so the effect re-runs once loading clears **because the trigger changed**, not because the guard lifted

```tsx
// WRONG — re-fires on every loading transition, stomps on false edge
useEffect(() => {
  if (loading) return;
  setMessages(initialMessages);
}, [active?.id, loading]);

// RIGHT — applies once per id, defers if mid-stream, waits for next id change
const appliedRef = useRef<string | null>(null);
useEffect(() => {
  if (loading) return;
  if (appliedRef.current === active?.id) return;
  setMessages(initialMessages);
  appliedRef.current = active?.id ?? null;
}, [active?.id, loading]);
```

The ref turns `loading` in deps from "re-fire trigger" into "re-check gate" — a subtle but critical semantic shift.

## Implications

- **Watch for effects whose comment says "only on X change" but whose deps include a status flag.** That's the tell. Comments express intent; deps execute behavior. If they disagree, the code is wrong — usually silently, until a user notices their work disappear.
- **Async/streaming SDKs (ai-sdk, react-query, swr) surface `loading` / `status` / `fetching` flags.** It's tempting to add them to deps "so the UI reacts when they change." That's exactly the trap: reactions to flag transitions are almost always render-layer concerns (spinners, disabled buttons), not effect-layer concerns (state mutation).
- **Trust-impact is severe.** A message that flashes and disappears is worse than a visible error — the user has no signal that anything went wrong, just a growing sense that the app is losing their work. Per Architecture "Trust Enforcement" — a surface that silently drops user-visible artifacts violates the trust primitive.
- **Test coverage gap this revealed:** e2e assertions that wait for `[data-testid="assistant-message"]` to appear but don't then re-check it after a delay will pass during the visible-for-one-second window, even though the message is about to disappear. The Brief 211 AC ("still visible 30s after stream completes") is now the template for any streaming-UI e2e.

## Recurrence — Brief 290 (2026-05-19)

The Share Studio multi-channel fetch effect hit the **exact same trap, mirror-imaged**: deps were `[open, activeChannel, card, sessionId, cache, statusByChannel]`. Setting a channel's status to `"loading"` mutated `statusByChannel`, re-firing the effect; the effect's cleanup `return () => { cancelled = true; }` then flipped `cancelled` on the *in-flight* fetch, so the resolve handler's `if (cancelled) return;` skipped `setCache`/`setStatus` and the channel was permanently stuck "loading" (X tab never rendered its textbox; Playwright caught it, not the maker-checker reviewer). Fix was textbook 204: a `requestedRef: Set<ShareChannel>` dedupes one POST per channel, the effect deps shrank to `[open, activeChannel, loadChannel]` (no status/cache), and the fetch result is **always** applied keyed by its own channel — never gated by an effect-cleanup `cancelled` flag. Confirms the "future consideration" lint rule below is worth building: this is the second independent occurrence, and the bug is invisible to static review + maker-checker review — only a delayed/interaction e2e assertion exposes it.

## Where It Should Land

- **Immediate:** workspace.tsx fix (Brief 211) — the instance that prompted the insight
- **Architecture.md Layer 6 rendering section:** add a "Stream completion must not stomp state" rule alongside the streamed-text-vs-ContentBlock distinction (Insight-110)
- **Review checklist:** add a line for "Does any `useEffect` list a loading/status flag in deps while also mutating user-visible state?" under the Layer 6 section
- **Future consideration:** a lightweight lint rule could flag this pattern — `loading` / `isPending` / `status` / `fetching` identifiers in an effect's deps array when the effect body calls a `setX` identified setter. Worth exploring if this pattern recurs.
