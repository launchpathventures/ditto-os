# Production Deploy Setup Runbook

**Brief 220** — one-time setup to wire `deploy-prod.yml` into a project's
GitHub Environment + required-reviewer + GitHub Mobile push-notification
flow. After this runbook, each merge to `main` queues a production deploy
that the user approves with a single tap on their phone.

---

## Prerequisites

- The project's repo is connected to Ditto (you already see PR + Vercel
  preview cards in the work-item conversation surface — that means
  `cloud-runner-fallback.ts` is wired and the GitHub webhook is
  delivering events).
- You have admin access to the GitHub repo (Settings → Environments
  requires admin).
- You have GitHub Mobile installed on your phone with push notifications
  enabled. Optional but strongly recommended — the one-tap approve UX
  depends on it.

---

## Step 1 — Create the `production` GitHub Environment

GitHub repo `Settings` → `Environments` → `New environment`.

Name the environment **exactly** what's in `project.deployTargetEnvironment`
in Ditto. The default is `production` (lowercase). If you're using a
non-default name (e.g., `prod` for a Netlify-flavored config), use that.

```bash
# Verify the project's deployTargetEnvironment in Ditto.
# Default is "Production" (uppercase) per Vercel's convention; many
# projects override to "production" (lowercase) to match Actions defaults.
# The handler treats `Production` and the project-configured value both
# as production-environment matches.
echo "Ditto default deployTargetEnvironment: Production"
```

---

## Step 2 — Add yourself as a Required Reviewer

In the new environment's settings:

1. Tick `Required reviewers`.
2. Add your GitHub username (or a team).
3. **Maximum 6 reviewers**, ONE approval suffices. For solo founders
   that's just you; for teams, choose people who can be paged.

This is the gate. Without a Required Reviewer, the workflow runs without
pause and Ditto sees only `success`/`failure` — no approval moment.

---

## Step 3 — Paste the workflow template

Copy `docs/runner-templates/deploy-prod.yml` from the Ditto repo into
your project's `.github/workflows/deploy-prod.yml`. Commit it.

Pick **one** of the four vendor blocks (Vercel default; Netlify,
Cloudflare Pages, Fly.io as commented alternatives). Delete the other
three. Replace `<ANGLE-BRACKET>` placeholders with your project's values.

```bash
# Sanity-check the file you committed:
cat .github/workflows/deploy-prod.yml | head -20
```

---

## Step 4 — Add the required secrets

In the GitHub repo `Settings` → `Secrets and variables` → `Actions`:

For Vercel (default in the template):

| Secret | Where to get it |
|--------|-----------------|
| `VERCEL_TOKEN` | <https://vercel.com/account/tokens> — create with project scope |
| `VERCEL_ORG_ID` | Run `vercel link` in your project; read `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | Same source as above |

For other vendors, see the comments in `deploy-prod.yml`.

```bash
# Verify the secret names are correct (no typos).
# Replace OWNER and REPO with your repo path (e.g., acme/agent-crm):
OWNER=your-github-org
REPO=your-repo-name
gh secret list --repo "$OWNER/$REPO"
```

---

## Step 5 — Verify GitHub Mobile push notifications

GitHub Mobile → `Profile` → `Settings` → `Notifications` → make sure
`Deployments and environments` is enabled for push.

If GitHub Mobile is not installed: the deep-link in Ditto's "Deploy
approval pending" inline card still opens GitHub's mobile-web Actions
page in Safari/Chrome — three-tap UX (tap card → tap "Review pending
deployments" → tap "Approve and deploy") instead of one-tap. The flow
works either way; GitHub Mobile is the polish.

---

## Step 6 — First-deploy smoke test

```bash
# Push any commit to main to trigger the workflow:
echo "$(date)" >> CHANGELOG.md
git add CHANGELOG.md
git commit -m "Test deploy-prod workflow"
git push origin main
```

What you should observe, in order:

1. **GitHub Actions tab** — the `Deploy to Production` workflow appears
   with a yellow "Waiting for review" badge.
2. **GitHub Mobile push notification** on your phone within ~30s — title
   like "Deployment to production needs review."
3. **Ditto's conversation surface** for the work item that produced the
   merge — a "Deploy approval pending" inline card with an
   `Approve deploy in GitHub Mobile` button.
4. Tap the GitHub Mobile push (or tap the Ditto card's button on the
   phone) → GitHub Mobile opens the approve dialog → tap "Approve and
   deploy."
5. **Ditto's conversation surface** updates to "Deploying to production"
   within ~5s.
6. **Vendor deploys** (Vercel default ~30-90s).
7. **Ditto's conversation surface** updates to "Deployed to production
   — `<your-prod-url>`" with the prod URL as a tappable link.
8. The work item's `briefState` is now `deployed`. You're done.

If any step doesn't fire, check the GitHub repo's
`Settings → Webhooks → Recent Deliveries` for the `deployment_status`
event — it should be a 200 OK response.

---

## Troubleshooting

- **No GitHub Mobile push notification**: re-verify Step 5. Notifications
  are per-device; if you have GitHub Mobile on multiple phones, each
  needs the setting enabled.
- **Push notification arrives but Ditto's card doesn't appear**: check
  the project's `deployTargetEnvironment` matches the workflow's
  `environment: production` line exactly. Case-sensitive.
- **Card says "Deploy failed" but the deploy succeeded in GitHub**:
  the `failure` event arrived before `success` (out-of-order webhook
  delivery — rare but possible during GitHub incidents). The
  `briefState` reflects the latest event Ditto received; if the deploy
  truly succeeded, GitHub's later `success` event will retransition the
  state via the `deploy_failed → deployed` arc.
- **Multiple work items merging in close succession**: only the
  most-recently-shipped work item transitions through the deploy gate;
  the earlier work items see the deploy events as activity-stream
  entries but don't transition. This is by design (Brief 220 §Non-Goals
  — multi-work-item correlation is a future-brief concern).
