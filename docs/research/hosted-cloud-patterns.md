# Research: How Open-Source Projects Offer Hosted/Cloud Versions

**Date:** 2026-03-19
**Role:** Dev Researcher
**Question:** How do projects that started as local/self-hosted tools provide a "sign up and start using" experience?

---

## 1. OpenClaw (openclaw.ai)

**What it is:** Open-source AI agent framework (formerly Clawdbot/Moltbot) created by Peter Steinberger. ~68k GitHub stars. Runs autonomous AI agents on your own hardware, connecting to WhatsApp, Telegram, Discord.

**Hosted/cloud version:** OpenClaw itself does NOT offer an official hosted cloud. Instead, a **third-party ecosystem** of managed hosting providers has emerged:

- **ClawPod.cloud** — "Your first AI agent team, ready in 60 seconds." Managed OpenClaw stack. No Docker/SSH required.
- **RunMyClaw** — $30/month managed hosting.
- **xCloud** — $24/month, deploy in 5 minutes, includes Telegram & WhatsApp integration.
- **OpenClawd AI** — Separate company offering cloud-hosted OpenClaw with region-optimized infrastructure.
- **Featherless** — "Managed OpenClaw" with sandboxed runtime and bundled inference at a flat monthly fee (no per-token billing).

**Signup experience:** Third-party hosts offer account creation in ~30 seconds, agent running in under 5 minutes. No server or technical setup. Cancel-anytime, 7-day refund policies.

**Pricing model:** Ranges from $0 (self-hosted on free-tier VPS) to $24-40/month for managed hosting. All use BYOK (Bring Your Own Key) for LLM API access. Some bundle inference.

**Relationship to open source:** The managed hosts deploy the same open-source codebase. They add infrastructure management, monitoring, auto-updates, and simplified onboarding. OpenClaw's open-source license (MIT-adjacent) allows this.

**Infrastructure:** Various — DigitalOcean, Hetzner, custom. Nvidia developed "NemoClaw" built on top of OpenClaw for enterprise/security use cases.

**Revenue tension:** OpenClaw itself stays fully open source as a hobby project. Revenue accrues to the third-party hosting ecosystem, not the project creator. This is the "WordPress model" — the project is free, hosting providers monetize.

Sources:
- [OpenClaw official site](https://openclaw.ai/)
- [Contabo: What is OpenClaw](https://contabo.com/blog/what-is-openclaw-self-hosted-ai-agent-guide/)
- [Milvus: Complete Guide to OpenClaw](https://milvus.io/blog/openclaw-formerly-clawdbot-moltbot-explained-a-complete-guide-to-the-autonomous-ai-agent.md)
- [The New Stack: Managed OpenClaw](https://thenewstack.io/managed-openclaw-serverless-agents/)
- [xCloud OpenClaw Hosting](https://xcloud.host/openclaw-hosting/)
- [ClawPod.cloud](https://www.clawpod.cloud/)

---

## 2. n8n

**What it is:** Fair-code workflow automation platform. 400+ integrations. Visual workflow builder with custom code support. ~48k GitHub stars.

**Hosted/cloud version:** Yes — **n8n Cloud** is the official managed offering, run by n8n GmbH.

**Signup experience:** Sign up at n8n.io, get a cloud instance. No infrastructure to manage. Same UI as self-hosted.

**Pricing model (cloud):**
- **Starter:** €24/month — 2,500 executions
- **Pro:** €60/month — 10,000 executions
- **Enterprise:** €800/month — 40,000 executions
- All plans: unlimited users, unlimited workflows, 400+ integrations

**Pricing model (self-hosted):**
- **Community Edition:** Free, unlimited executions, forever. Sustainable Use License.
- **Enterprise (self-hosted):** Per-execution fees apply for business features.
- Infrastructure cost: typically $20-200/month depending on scale.

**Relationship to open source:** Same core codebase. Enterprise features are distinguished at the file level — any source file containing `.ee.` in its filename (e.g., `WorkflowHistoryManager.ee.ts`) is governed by the enterprise license. Single codebase, feature-flagged by license.

**Infrastructure:** n8n Cloud runs on managed infrastructure (details not public). Self-hosted uses Docker + PostgreSQL, optionally Redis for queue mode (distributed execution).

**Revenue tension:** "Fair-code" license — not strictly open source (Sustainable Use License). Commercial use requires a license for enterprise features. Community Edition is genuinely free and unlimited but excludes SSO, LDAP, advanced RBAC. The execution-based cloud pricing creates a natural upgrade path as usage grows.

Sources:
- [n8n Pricing](https://n8n.io/pricing/)
- [n8n Hosting Docs](https://docs.n8n.io/hosting/)
- [n8n GitHub](https://github.com/n8n-io/n8n)
- [Northflank: Self-host n8n guide](https://northflank.com/blog/how-to-self-host-n8n-setup-architecture-and-pricing-guide)
- [DeepWiki: n8n Licensing](https://deepwiki.com/n8n-io/n8n-docs/5.2-licensing-and-deployment-options)

---

## 3. Supabase

**What it is:** Open-source Firebase alternative. Postgres-based. Includes database, auth, storage, edge functions, real-time subscriptions, vector search. ~75k GitHub stars. $5B valuation, $70M ARR, 4M+ developers.

**Hosted/cloud version:** Yes — **Supabase Cloud** is the primary product. Hosted exclusively on AWS.

**Signup experience:** Sign up at supabase.com, create a project, get a Postgres database + full backend in minutes. No credit card required for free tier.

**Pricing model:**
- **Free:** $0 — 2 projects, 500MB database, 50K monthly active users, 1GB file storage. Projects auto-pause after 7 days of inactivity.
- **Pro:** $25/month per project — 8GB database, 100K MAUs, 100GB storage. Usage-based billing beyond included quotas.
- **Team:** $599/month — Pro features + SSO, SOC 2 reports, compliance, 28-day log retention.
- **Enterprise:** Custom pricing — SLAs, 24/7 support, private Slack, BYO cloud option.
- Most small-to-medium production apps: $35-75/month once usage fees are included.

**Relationship to open source:** Supabase is MIT-licensed. The managed cloud runs the same open-source components (PostgREST, GoTrue, Realtime, Kong, Studio dashboard, etc.) on AWS infrastructure. Self-hosted deployments use Docker Compose with the same container images. The cloud adds managed infrastructure, auto-scaling, backups, and monitoring.

**Infrastructure:** AWS exclusively for the managed cloud. Users choose an AWS region for their project. Self-hosted can run anywhere — community templates exist for AWS (CloudFormation/CDK using ECS Fargate + Aurora), DigitalOcean, Fly.io, etc.

**Revenue tension:** Fully open source (MIT). Revenue comes from the managed cloud service, not license restrictions. The cloud offers convenience, reliability, and scale that self-hosting cannot easily match. Enterprise features (HIPAA compliance, dedicated infrastructure, BYO cloud) drive higher-tier revenue. This is the purest "open source + managed cloud" model.

Sources:
- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase Self-Hosting Docs](https://supabase.com/docs/guides/self-hosting)
- [Supabase on AWS](https://github.com/supabase-community/supabase-on-aws)
- [Metacto: True Cost of Supabase](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)
- [UI Bakery: Supabase Pricing](https://uibakery.io/blog/supabase-pricing)

---

## 4. Gitea / Gitea Cloud / Codeberg

**What it is:** Gitea is a lightweight, self-hosted Git service written in Go. MIT-licensed. Single binary. Codeberg is a free hosted instance running Forgejo (a community fork of Gitea).

**Hosted/cloud version:** Yes — **Gitea Cloud** (cloud.gitea.com) provides managed DevOps instances. Also, **Codeberg** (codeberg.org) offers free hosting powered by Forgejo.

**Signup experience:** Gitea Cloud: "Get a DevOps instance in minutes." Codeberg: sign up for free, start pushing code immediately.

**Pricing model:**
- **Open Source (self-hosted):** Free. MIT license. Unlimited users and repos.
- **Enterprise (self-hosted):** $9.50-$19/user/month — adds SAML SSO, audit logs, Kubernetes auto-scaling runners, priority support, SLA.
- **Gitea Cloud:** Pricing not prominently published (appears to be evolving). Likely mirrors the self-hosted enterprise tiers.
- **Codeberg:** Free (non-profit, donation-funded). Run by a German non-profit. 100K+ projects, 95K+ developers.
- **Third-party hosts:** HostedGitea.com at $24/month, Stellar Hosted with 14-day free trial, Elestio with hourly billing.

**Relationship to open source:** Gitea's open-source edition is the same core codebase. Enterprise features are added via a commercial license layer. Codeberg runs Forgejo, which forked from Gitea over governance disagreements. The forks share most code.

**Infrastructure:** Gitea Cloud: managed by Gitea Ltd. Codeberg: community-operated on German infrastructure (privacy-first). Self-hosted: runs as a single Go binary anywhere.

**Revenue tension:** Gitea formed a company (Gitea Ltd) to offer commercial services, which triggered the Forgejo fork by community members concerned about corporate capture. Codeberg demonstrates an alternative model: non-profit, donation-funded, free forever. The tension between "MIT-licensed project" and "company needs revenue" led to an actual community split.

Sources:
- [Gitea Official Pricing](https://about.gitea.com/pricing/)
- [Gitea Cloud](https://cloud.gitea.com/)
- [Gitea GitHub](https://github.com/go-gitea/gitea)
- [Codeberg](https://codeberg.org/)
- [DasRoot: Self-Hosted Git Platforms 2026](https://dasroot.net/posts/2026/01/self-hosted-git-platforms-gitlab-gitea-forgejo-2026/)

---

## 5. PocketBase

**What it is:** Open-source backend in a single Go binary. SQLite-based. Includes auth, file storage, real-time subscriptions, admin UI. ~45k GitHub stars.

**Hosted/cloud version:** No official cloud. The creator has explicitly stated: "PocketBase is a hobby project and [I] don't have the time or resources to manage a full-fledged cloud hosting." However, a community ecosystem exists.

**Community hosting solutions:**
- **PocketHost** (pockethost.io) — Open-source multi-tenant hosting platform specifically for PocketBase. Treats each SQLite-backed backend as a disposable, URL-addressable microservice.
- **Elestio** — Fully managed PocketBase instances. Handles installation, config, encryption, backups, monitoring, updates.
- **Railway** — One-click deploy template for PocketBase.
- **Free VPS options:** Google Cloud free tier (e2-micro), Oracle Cloud Always Free, IBM LinuxONE.
- **Traditional VPS:** Hetzner, Vultr, UpCloud, Linode — deploy the single binary anywhere.

**Pricing model:** PocketBase itself is free (MIT license). Hosting costs are purely infrastructure: $0 (free tier VPS) to $5-50/month (managed services).

**Relationship to open source:** PocketBase is fully open source. Community hosting wraps the same binary with managed infrastructure. PocketHost is itself open source.

**Revenue tension:** None, because PocketBase is a hobby project with no commercial ambitions. The creator has no interest in monetization. Community fills the hosting gap independently.

Sources:
- [PocketBase FAQ](https://pocketbase.io/faq/)
- [PocketBase GitHub Discussion #432: Hosting?](https://github.com/pocketbase/pocketbase/discussions/432)
- [Railway: Deploy PocketBase](https://railway.com/deploy/pocketbase-1)
- [Elestio: PocketBase](https://elest.io/open-source/pocketbase)
- [BrightCoding: Multi-Tenant PocketBase Hosting](https://www.blog.brightcoding.dev/2025/08/24/multi-tenant-pocketbase-hosting-with-cli-and-scaling-tools/)

---

## 6. Cal.com

**What it is:** Open-source scheduling infrastructure. Alternative to Calendly. App ecosystem with 400+ integrations. AGPLv3 license.

**Hosted/cloud version:** Yes — **Cal.com Cloud** is the primary managed offering.

**Signup experience:** Sign up at cal.com, start scheduling for free. No credit card required. Unlimited bookings, calendars, and integrations on the free tier.

**Pricing model:**
- **Free:** $0 — 1 user, unlimited bookings. Cal.com branding on booking pages.
- **Teams:** $15/user/month — removes single-user restriction, team collaboration features.
- **Organizations:** $37/user/month — advanced privacy/security controls, multi-department routing, compliance.
- **Enterprise:** Custom pricing via sales.

**Relationship to open source:** AGPLv3-licensed. Same codebase for self-hosted and cloud. Self-hosted is free but requires your own server infrastructure ($5-50+/month). The cloud version adds managed hosting, support, and potentially faster feature rollouts.

**Infrastructure:** Not publicly detailed. Self-hosted uses Docker/Node.js.

**Revenue tension:** AGPL license requires anyone modifying the code to share changes, which discourages competitors from offering a closed-source hosted version. Revenue comes from per-seat cloud pricing (Teams/Organizations tiers) and enterprise contracts. The free tier serves as lead generation — single users get full functionality, teams must pay.

Sources:
- [Cal.com Pricing](https://cal.com/pricing)
- [Cal.com](https://cal.com/)
- [SchedulingKit: Cal.com Pricing 2025](https://schedulingkit.com/pricing-guides/cal-com-pricing)
- [Zeeg: Cal.com Pricing Guide](https://zeeg.me/en/blog/post/cal-com-pricing)
- [Efficient.app: Cal.com Review](https://efficient.app/apps/cal)

---

## 7. Plane

**What it is:** Open-source project management. Alternative to Jira/Linear/Monday. Includes Projects, Wiki, and AI features. AGPL-3.0 license.

**Hosted/cloud version:** Yes — **Plane Cloud** with a free tier.

**Signup experience:** Sign up at plane.so, start using immediately. Free tier available.

**Pricing model:**
- **Community Edition (self-hosted):** Free. AGPL-3.0. Unlimited projects, work items, cycles, modules, pages, 5 layout views, intake, dashboards, estimates, REST API, webhooks. No user limits.
- **Cloud Free Tier:** Free with core features.
- **Commercial (cloud or self-hosted):** $7/seat/month — adds workflows, approval gates, audit trails, SSO (SAML/OIDC/LDAP), GitHub/GitLab/Slack integrations.
- **Commercial Air-Gapped:** Same price, for fully disconnected networks (defense, healthcare, government, aerospace).

**Key detail:** Plane charges the same price whether you deploy on cloud or self-host. This is unusual — most projects charge more for cloud.

**Relationship to open source:** Three editions from the same codebase:
1. Community Edition (AGPL-3.0) — fully open, self-hosted only
2. Commercial Edition — adds enterprise features, cloud or self-hosted
3. Air-Gapped Edition — for disconnected networks

Self-hosted deploys in under 10 minutes via Docker, Kubernetes (Helm), Podman, or one-click platforms. Minimal requirements: 2 CPU cores, 4GB RAM, <2GB image.

**Revenue tension:** AGPL license protects against cloud competitors offering the service without contributing back. Free Community Edition builds adoption, Commercial edition monetizes teams that need enterprise features. "Start with Community Edition. Scale when you're ready."

Sources:
- [Plane Open Source](https://plane.so/open-source)
- [Plane GitHub](https://github.com/makeplane/plane)
- [Plane Editions Docs](https://developers.plane.so/self-hosting/editions-and-versions)
- [Plane.so](https://plane.so)

---

## 8. Twenty

**What it is:** Open-source CRM. Alternative to Salesforce. Developer-first, no-code data modeling, auto-generated APIs. AGPLv3 license. ~28k GitHub stars, 300+ contributors.

**Hosted/cloud version:** Yes — Twenty offers a hosted cloud at twenty.com. Third-party managed hosting also available.

**Signup experience:** Sign up at twenty.com. Cloud offering available. Details suggest early-adopter pricing model.

**Pricing model:**
- **Self-hosted:** Free (AGPLv3). Docker Compose deployment. Requires 8GB+ RAM. Infrastructure cost: $50-200/month on AWS depending on user count.
- **Official cloud:** ~$9/user/month (based on available data). "All-inclusive, no surprise costs."
- **CloudStation (third-party):** $17.99/month for unlimited users (flat fee, no per-seat).

**Relationship to open source:** AGPLv3. Same codebase for self-hosted and cloud. Self-hosted documentation is comprehensive (Docker, Kubernetes, manual). The cloud adds managed infrastructure.

**Infrastructure:** Self-hosted runs on Docker Compose with PostgreSQL. Cloud infrastructure not publicly detailed.

**Revenue tension:** Early stage — still establishing the commercial model. Per-seat pricing is low ($9/user) to undercut Salesforce ($25-165/user). AGPLv3 protects against closed-source competitors. Community-powered development (300+ contributors) reduces engineering costs.

Sources:
- [Twenty.com](https://twenty.com/)
- [Twenty Pricing](https://twenty.com/pricing)
- [Twenty GitHub](https://github.com/twentyhq/twenty)
- [TechCrunch: Twenty open source Salesforce alternative](https://techcrunch.com/2024/11/18/twenty-is-building-an-open-source-alternative-to-salesforce/)
- [TaskRhino: Twenty CRM Review](https://www.taskrhino.ca/blog/twenty-crm-review/)
- [Twenty Self-Host Docs](https://docs.twenty.com/developers/self-host/self-host)

---

## 9. Hatchet

**What it is:** Open-source distributed task queue and orchestration platform. Built on Postgres. Can be used as a queue, DAG orchestrator, or durable execution engine. YC W24. Processes 1B+ tasks/month.

**Hosted/cloud version:** Yes — **Hatchet Cloud** is the managed offering.

**Signup experience:** Sign up at hatchet.run. Free tier available. Cloud-first approach.

**Pricing model:**
- **Free:** $0/month — 10 tasks/second throughput, 2,000 concurrent runs, 2,000 tasks/day, 1GB storage, $5/month compute credits, 1 worker, 1 user, 1-day data retention, Discord support only.
- **Starter:** $180/month — higher throughput, more concurrent runs, expanded quotas.
- **Growth:** $425/month — for larger services with complex scaling needs.
- **Enterprise:** Custom — 500-10,000 tasks/second, SOC 2, HIPAA, BAA, private Slack, onboarding assistance.

**Relationship to open source:** Fully open source (MIT license). Self-hosted and cloud share the same engine. Cloud adds managed infrastructure, monitoring, scaling, and support tiers.

**Infrastructure:** Built on Postgres. Cloud infrastructure not publicly detailed. Self-hosted runs via Docker.

**Revenue tension:** Open source core with a managed cloud that adds operational value. Free tier is generous enough for testing but limited (1-day retention, 1 worker, 1 user). Natural upgrade path as usage grows. Enterprise tier adds compliance certifications that require managed infrastructure.

Sources:
- [Hatchet.run](https://hatchet.run/)
- [Hatchet Pricing](https://hatchet.run/pricing)
- [Hatchet GitHub](https://github.com/hatchet-dev/hatchet)
- [YC: Hatchet](https://www.ycombinator.com/companies/hatchet-run)
- [Hacker News: Hatchet v1](https://news.ycombinator.com/item?id=43572733)

---

## 10. Trigger.dev

**What it is:** Open-source platform for background tasks and AI agent workflows in TypeScript. Long-running tasks, retries, queues, elastic scaling. Hosts your task code on their servers.

**Hosted/cloud version:** Yes — **Trigger.dev Cloud** is the primary offering, cloud-first.

**Signup experience:** "Get started for free" at cloud.trigger.dev. No credit card required. Tasks live in `/trigger` folders in your codebase, bundled and deployed together.

**Pricing model:**
- **Free:** $0/month — $5 monthly compute credit, 20 concurrent runs, unlimited tasks, 5 team members, 1-day log retention.
- **Hobby:** $10/month — $10 compute credit, 50 concurrent runs, 7-day log retention.
- **Pro:** $50/month — $50 compute credit, 200+ concurrent runs (expandable), 25+ team members, 30-day retention, dedicated Slack support.
- **Enterprise:** Custom — all Pro features + custom retention, priority support, RBAC, SOC 2, SSO.
- **Compute pricing:** Per-second billing based on machine type. Micro (0.25 vCPU): $0.0000169/sec. Small (0.5 vCPU): $0.0000338/sec. Up to Large (8 vCPU): $0.0006800/sec. Run invocation: $0.25 per 10,000 runs.

**Key detail:** "Bring Your Own Cloud" option — fully managed Trigger.dev Cloud deployed in your own AWS, GCP, or Azure account. This is a hybrid model: managed service on your infrastructure.

**Relationship to open source:** Open source and self-hostable. Cloud is the same codebase with managed infrastructure. Development environment runs are not charged.

**Infrastructure:** Cloud runs task code on their managed workers. BYO Cloud deploys into your cloud account. Self-hosted is available but cloud is the primary path.

**Revenue tension:** Cloud-first model with open-source self-hosting as an option. Revenue from usage-based compute billing. Generous free tier for adoption, natural scaling to paid tiers. BYO Cloud addresses enterprises that need their own infrastructure but want managed service.

Sources:
- [Trigger.dev Pricing](https://trigger.dev/pricing)
- [Trigger.dev](https://trigger.dev/)
- [Trigger.dev BYO Cloud](https://trigger.dev/byo-cloud)
- [Trigger.dev Self-Hosting Docs](https://trigger.dev/docs/self-hosting/overview)
- [Trigger.dev GitHub](https://github.com/triggerdotdev/trigger.dev)

---

## Cross-Cutting Patterns

### A. Open Source SaaS Hosting Patterns

Three dominant models emerge from this research:

**1. Open Core (n8n, Gitea, Plane)**
- Core product is open source (often with a copyleft or "fair-code" license)
- Enterprise features gated behind a commercial license
- Same codebase, feature-flagged by license key
- n8n pattern: files with `.ee.` in the filename are enterprise-licensed
- Revenue from enterprise license fees + managed cloud

**2. Managed Cloud (Supabase, Trigger.dev, Hatchet, Cal.com, Twenty)**
- Entire codebase is open source (MIT or AGPL)
- Revenue comes purely from operating the managed cloud service
- Cloud adds: infrastructure management, scaling, monitoring, backups, support, compliance
- Self-hosting is always an option but is deliberately left as "you do the ops work"
- Supabase is the clearest example: MIT-licensed, $70M ARR from cloud alone

**3. Third-Party Hosting Ecosystem (PocketBase, OpenClaw)**
- The project creator has no commercial offering
- Independent companies/communities build managed hosting around the open-source project
- PocketHost for PocketBase, ClawPod/RunMyClaw/xCloud for OpenClaw
- Revenue accrues to the hosting ecosystem, not the project
- Similar to the WordPress/WP Engine model

### B. License Choices and Their Implications

| License | Projects Using It | Effect |
|---------|------------------|--------|
| MIT | Supabase, Hatchet, PocketBase, OpenClaw | Maximum freedom. Anyone can host it commercially. Revenue must come from operational excellence. |
| AGPL-3.0 | Plane, Twenty, Cal.com | Copyleft. Competitors must open-source modifications. Discourages closed-source hosted competitors. |
| Fair-code / Sustainable Use | n8n | Not OSI-approved. Restricts commercial hosting without a license. Protects the company's cloud revenue. |
| Dual (MIT + Enterprise) | Gitea | Core is MIT, enterprise features under commercial license. |

### C. One-Click Deploy Buttons (Railway, Render, DigitalOcean, Cloudflare)

These platforms allow open-source projects to offer "deploy in minutes" experiences without building their own cloud:

**How they work:**
1. Project author creates a config file (e.g., `render.yaml`, `deploy.template.yaml`, Railway template)
2. Author adds a "Deploy to X" button in their README (a markdown image link)
3. User clicks the button, which opens the platform's deploy flow pre-configured
4. Platform auto-generates secrets, connects services, runs migrations, scales resources
5. User has a running instance in minutes with zero manual wiring

**Railway specifics:**
- 650+ community templates
- Open-source templates can earn kickbacks: up to 25% of usage revenue
- Templates define services, env config, network settings, databases
- One-click deploys include persistent storage, connection pooling, WebSocket support

**Render specifics:**
- `render.yaml` in the repo defines all services
- "Deploy to Render" button is a single markdown line in README
- Users review services, click approve, everything deploys
- Free tier available for basic services

**Key observation:** These platforms serve as the "cloud offering" for projects that don't want to build their own managed service. PocketBase on Railway, for example, gives a "sign up and deploy" experience without PocketBase building any cloud infrastructure.

### D. Signup-to-Running Time

| Project | Time to First Use (Cloud) | Time to First Use (Self-Hosted) |
|---------|--------------------------|--------------------------------|
| OpenClaw (via ClawPod) | ~5 minutes | 30-60 minutes |
| n8n Cloud | ~2 minutes | 15-30 minutes |
| Supabase | ~2 minutes | 30-60 minutes |
| Gitea Cloud | ~5 minutes | 10-15 minutes (single binary) |
| PocketBase (via Railway) | ~5 minutes | 5-10 minutes (single binary) |
| Cal.com | ~2 minutes | 15-30 minutes |
| Plane | ~2 minutes | <10 minutes (Docker) |
| Twenty | ~2 minutes | 15-30 minutes |
| Hatchet | ~2 minutes | 15-30 minutes |
| Trigger.dev | ~2 minutes | 30+ minutes |

### E. The Revenue Tension: Common Resolutions

1. **Convenience tax:** Cloud is the same product but with ops handled for you. You pay for not having to manage infrastructure. (Supabase, Trigger.dev, Hatchet)

2. **Feature gating:** Enterprise features (SSO, RBAC, audit logs, compliance) only available in paid tiers. (n8n, Plane, Gitea)

3. **Usage-based scaling:** Free tier is generous for testing, costs scale with usage. Natural conversion as projects grow. (Trigger.dev, Hatchet, n8n, Supabase)

4. **License protection:** AGPL or fair-code prevents competitors from offering a closed-source hosted version, protecting the creator's cloud revenue. (Cal.com, Plane, Twenty, n8n)

5. **BYO Cloud / Hybrid:** For enterprises that need their own infrastructure but want managed service. (Trigger.dev BYO Cloud, Supabase Enterprise)

6. **Let others monetize:** Project stays a hobby/community effort. Third parties build hosting businesses. (PocketBase, OpenClaw)

---

## Raw Data Notes

- Supabase is the largest proof point for "open source + managed cloud = large revenue" ($70M ARR, $5B valuation, MIT license)
- n8n's "fair-code" license is controversial but commercially effective
- Gitea's commercialization led to the Forgejo fork — a cautionary tale about community governance
- PocketBase's "no cloud, it's a hobby" stance led to organic community hosting (PocketHost)
- Trigger.dev's BYO Cloud is an emerging pattern — managed service deployed in YOUR cloud account
- Railway's template kickback model (25% for open-source templates) creates financial incentives for projects to support one-click deploy
