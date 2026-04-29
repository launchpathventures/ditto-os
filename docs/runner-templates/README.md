# Runner Templates

Reference workflows for cloud-runner adapters. **Documentation, not code** —
Ditto does not commit YAML to user repos. The user copies a template into
their own `.github/workflows/` directory.

## Files

- **`dispatch-coding-work.yml`** — Brief 218 GitHub Actions runner template.
  Paste into the user repo's `.github/workflows/` to make a `github-action`
  runner dispatchable from Ditto. Required PAT scopes: `actions:write` +
  `contents:read`. Brief 232 added a `responseBody` channel: if your task
  expects structured output (e.g., the project retrofitter expects
  `{commitSha, actuallyChangedFiles, skippedFiles}`), have your work step
  write the corresponding values to `$GITHUB_ENV` as `COMMIT_SHA`,
  `ACTUALLY_CHANGED_FILES` (JSON array), `SKIPPED_FILES` (JSON array,
  optional) — the callback step assembles them automatically.
- **`deploy-prod.yml`** — Brief 220 production-deploy template. Paste into
  the user repo's `.github/workflows/` to engage GitHub's Environment +
  required-reviewer gate for production deploys. Companion runbook at
  [`deploy-prod-setup.md`](./deploy-prod-setup.md) walks through the
  one-time GitHub-side setup (Environment creation, Required Reviewer,
  GitHub Mobile push notifications). Vendor-agnostic at the workflow
  level; Vercel default with Netlify, Cloudflare Pages, Fly.io as
  commented alternatives.

## Why `docs/runner-templates/` and not `templates/`

The path is deliberate (Brief 218 §D16). These files are **reference
documents**, not source-controlled application code:

- The admin UI (`/projects/<slug>/runners`) reads the template content via the
  "Copy template" button. The string in the page component is the operational
  source of truth at the boundary; the file under `docs/runner-templates/` is
  the canonical reference.
- Ditto does **not** auto-commit these files to user repos. Auto-commit would
  require write access + branching policy navigation that doesn't pay back at
  this scope.
- Updating a template is a documentation change, not a code change. Refresh
  the in-page string at the same time so the admin form stays in lockstep.

## Auth & scope requirements

| Template | Required scopes | Required secrets (in user repo) |
|----------|-----------------|--------------------------------|
| `dispatch-coding-work.yml` | PAT (Ditto-side): `actions:write`, `contents:read`. Workflow itself opens PRs so `contents: write` + `pull-requests: write` job permissions are declared. | `ANTHROPIC_API_KEY` (always, for Claude Code). `DITTO_RUNNER_BEARER` (optional, for `in-workflow-secret` callback mode). |
| `deploy-prod.yml` | None Ditto-side (the workflow self-runs on push to main). Workflow declares `deployments: write` + `id-token: write` job permissions for the deploy step + OIDC. | Vercel (default): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Vendor alternatives documented inline in the template. **Plus** the GitHub Environment `production` configured with at least one Required Reviewer (the user) — this is the gate, not a secret. |
