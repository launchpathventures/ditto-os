# Runner Templates

Reference workflows for cloud-runner adapters. **Documentation, not code** —
Ditto does not commit YAML to user repos. The user copies a template into
their own `.github/workflows/` directory.

## Files

- **`dispatch-coding-work.yml`** — Brief 218 GitHub Actions runner template.
  Paste into the user repo's `.github/workflows/` to make a `github-action`
  runner dispatchable from Ditto. Required PAT scopes: `actions:write` +
  `contents:read`.

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
