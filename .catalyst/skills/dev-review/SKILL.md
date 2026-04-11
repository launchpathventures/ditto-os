---
name: dev-review
description: Post-coding exhaustive review — catches integration bugs, runtime crashes, performance issues, and convention drift across all changed files
argument-hint: "[--fix]"
---

## Why This Skill Exists

AI coding sessions produce code that compiles but hides integration bugs, runtime crashes, performance traps, and convention drift. These issues compound across sessions and are invisible without systematic review. `/dev-review` runs a multi-pass audit on every file changed in the current session, catching the bugs that `pnpm typecheck` and linters miss.

This skill was born from a real session where **five consecutive "looks clean" reviews** each found critical bugs — wrong database table queries, N+1 API calls, unstable React dependencies, missing auth checks, ownership bugs, and silent data flow failures. The lesson: static code reading catches ~40% of bugs. You need progressive depth — imports, then integration, then runtime paths, then performance, then UX edge cases.

## Repo Context

- Read `@AGENTS.md` — repo conventions (container queries, core components, route helpers, etc.)
- Read `@catalyst/LEARNINGS.md` — known AI mistake patterns

## How It Works

The review runs **five sequential passes** at increasing depth. Each pass catches a different class of bug. Do NOT skip passes or combine them — the layered approach is the point.

Run on all files changed since the last commit (or since branch diverged from base):

```bash
git diff --name-only HEAD  # uncommitted changes
git diff --name-only origin/master...HEAD  # full branch diff
```

If `$ARGUMENTS` contains `--fix`, fix issues as you find them. Otherwise, report only.

## Routing

→ See [dev-review-checklist.md](references/dev-review-checklist.md)

## Guardrails

- Review ONLY files that were changed — don't audit the entire codebase
- Report issues with file path and line number
- Don't fix issues unless `--fix` is passed — document them clearly
- Run `pnpm typecheck` at the end to confirm no regressions
- If you find >10 issues, stop after Pass 3 and ask the user if they want to continue
