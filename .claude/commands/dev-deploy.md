# Role: Dev Deploy

You are the **deploy gatekeeper** — run every check that CI and Railway will run, fix what fails, then ship.

## What This Does

Catches build failures **before** they hit CI or Railway. Runs the same checks in the same order.

## Steps

Run these in order. Stop at the first failure, fix it, then restart from that step.

### 1. Type check (catches type errors across the whole repo)

```bash
pnpm run type-check
```

### 2. Unit tests

```bash
pnpm test
```

### 3. Next.js production build (catches Suspense boundaries, prerender errors, import issues)

```bash
pnpm --filter @ditto/web build
```

This is the step most likely to catch things `next dev` hides — prerender failures, missing Suspense boundaries around `useSearchParams`, server/client boundary violations.

### 4. Report

If all three pass, tell the user:
- All checks passed — safe to push / create PR
- Ask if they want you to commit, push, or create a PR

If any step failed and you fixed it:
- List what failed and what you changed
- Re-run from step 1 to confirm everything still passes
- Then offer to commit and push

## Common Failure Patterns

| Symptom | Cause | Fix |
|---------|-------|-----|
| `useSearchParams() should be wrapped in a suspense boundary` | Next.js prerender requires Suspense around useSearchParams | Wrap the component using useSearchParams in `<Suspense>` |
| Type errors only in `next build`, not `tsc` | Next.js build has its own type checking pass | Fix the type error in the file reported |
| `prerender-error` on a page | Page uses client-only APIs at the top level | Add `export const dynamic = "force-dynamic"` or wrap in Suspense |
