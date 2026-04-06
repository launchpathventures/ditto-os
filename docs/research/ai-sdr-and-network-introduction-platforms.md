# AI SDR/BDR Tools and Network Introduction Platforms

**Date:** 2026-04-05
**Researcher:** Dev Researcher
**Consumers:** Dev Architect (Brief 079 — Network Agent MVP), Dev Designer (character bible, channel UX)
**Reference docs consulted:** architecture.md (L2 Agent, L3 Harness, L5 Learning, trust tiers), ADR-003 (memory scopes), ADR-007 (trust earning), ADR-005 (external integrations), landscape.md
**Status:** Active

## Context

Ditto Network Agent is an AI super-connector operating on behalf of SMB owners via email/voice/SMS. One Ditto character with mode-shifted alignment (Self/Selling/Connecting). Three-layer persona architecture (House → Persona → User Binding). Channel-native, no webapp. Differentiation: relationship-first (not volume-first) and networked (every user makes every other user's connections more valuable).

Research question: What exists that Ditto can build FROM? What patterns work, what fails, and what is original to Ditto?

---

## Track 1: AI SDR/BDR Landscape

### 1.1 Market Overview (2025-2026)

The AI SDR space has entered a correction phase. Key market signals:

- **50-70% churn within 3 months** across AI SDR platforms — 10x higher than typical SaaS churn of 5-10%
- **75-90% churn at 3 months** reported for specific platforms
- 45% of sales teams have moved to **hybrid models** (AI + human)
- AI-only pipeline: 847 meetings, 11% opportunity conversion
- AI + human hybrid: 312 meetings, 38% opportunity conversion, **2.3x more revenue**
- AI SDR meeting-to-opportunity conversion: ~15% vs 25% for human SDRs (40% quality drop)

The bubble narrative: "Pretty much all hype... The problem with all the AI SDR startups was that they tried to automate the entire workflow, which they did poorly." (r/sales)

### 1.2 11x (Alice)

**What it is:** AI SDR for outbound prospecting (email + LinkedIn). Raised $50M Series B from a16z at $350M valuation.

**Architecture:** Rebuilt from scratch in 3 months. Experimented with three agent architectures (ReAct, workflow-based, multi-agent), settled on hierarchical multi-agent with specialized sub-agents. Alice 2.0 (Jan 2025): ~2M leads sourced, ~3M messages sent, ~21K replies. Reply rate ~2% (matches human SDR).

**Outreach framing:** Ghostwriting — sends as the user, not as an AI identity. No transparent AI disclosure.

**Companion agent:** Julian handles inbound phone qualification with natural two-way voice conversations.

**Issues:** TechCrunch exposed 11x claiming customers it didn't have (ZoomInfo, Airtable logos used without consent). High volume, low quality signal.

**Patterns worth studying:**
- Multi-agent architecture with specialized sub-agents per task
- Separate inbound (Julian/voice) vs outbound (Alice/email) agents
- Self-learning capabilities planned (memory, reinforcement learning)

**Gaps (Ditto-relevant):**
- Volume-first, not relationship-first
- No network effect — each user is isolated
- No trust model governing outreach quality
- No recipient-side value proposition

### 1.3 Artisan (Ava)

**What it is:** AI BDR. YC company. $25M Series A (April 2025). ~$5M ARR by early 2025.

**Architecture:** 10-minute onboarding conversation where Ava scrapes user's website + builds knowledge base. Database of 270M+ contacts. Gathers 10s of data points per prospect (technographic, firmographic, demographic, intent, personal interest).

**Outreach framing:** Ghostwriting — sends as the user. Ava writes in the user's tone of voice. Personalization references job changes, funding rounds, social posts, news.

**Deliverability:** Built-in warmup, mailbox health monitoring, dynamic sending limits.

**Automation level:** April 2024 shifted from workflow assistant to autonomous execution — prospecting, email sequencing, meeting scheduling without human approval.

**Patterns worth studying:**
- 10-minute conversational onboarding → knowledge base creation (directly analogous to Ditto intake)
- Website scraping for company understanding
- Multi-signal personalization (job changes, funding, social posts)
- Built-in deliverability infrastructure

**Gaps (Ditto-relevant):**
- Autonomous sending without approval = Artisan moved AWAY from human-in-the-loop
- Volume play (1000s of emails) — opposite of Ditto's quality play
- No relationship memory — each sequence is stateless
- No network effect

### 1.4 Clay

**What it is:** AI-powered data orchestration for sales. 100K+ users. 10x YoY growth for two consecutive years.

**Architecture:** Spreadsheet interface. 150+ data providers. Waterfall enrichment (check source A, if miss → source B, if miss → source C). Achieves 80%+ email match rates vs 40-50% single source. Claygent (GPT-4) scrapes websites for custom research.

**Outreach framing:** Not an outreach tool — Clay is the research/enrichment layer. Integrates with outreach tools (Apollo, Outreach, etc).

**Patterns worth studying:**
- **Waterfall enrichment** — sequential multi-source data resolution. Directly applicable to Ditto's person enrichment.
- **Claygent** — AI agent that researches by visiting websites, extracting specific information. Pattern for Ditto's prospect research.
- **Spreadsheet-as-interface** — users build custom workflows without code

**Gaps (Ditto-relevant):**
- Research/enrichment only, no outreach or relationship management
- Enterprise sales team tool, not SMB
- No relationship memory or network effect

### 1.5 Apollo.io

**What it is:** All-in-one sales platform. Contact data + outreach automation.

**Architecture:** Contact enrichment + sequence automation. Email warmup (discontinued 2024, then relaunched). AI Assistant (Oct 2025) for account-level questions.

**Deliverability:** SPF/DKIM/DMARC authentication support. Email warmup for sender reputation. Dynamic sending limits.

**Patterns worth studying:**
- Parallel dialing (multi-number simultaneous calling)
- Outbound copilot for workflow creation

**Gaps (Ditto-relevant):**
- Missing social automation, contact-level intent, AI voice
- Enterprise sales tool architecture
- No relationship continuity

### 1.6 Relevance AI

**What it is:** Platform for building custom AI agents. Australian company. Covers BDR, customer success, onboarding.

**Architecture:** Agent builder approach — teams create custom BDR workflows integrating proprietary data sources, qualification frameworks, multi-step processes. Account-level research (website analysis, LinkedIn, autonomous research directions).

**Patterns worth studying:**
- **Custom agent builder** rather than pre-built BDR — users define their own workflows
- **Autonomous research direction** — agent determines what to research based on initial findings
- **Event-triggered agents** — run on signals, not just schedules

**Gaps (Ditto-relevant):**
- Technical platform, not end-user product
- No persona/character layer
- No network effect

### 1.7 Cross-Cutting Failure Analysis

Three failure modes account for most AI SDR churn:

1. **Undefined ICP** — AI scales dysfunction at 10x speed. If targeting is wrong, more emails = more damage.
2. **Generic messaging** — prospects spot AI-written emails instantly. "Formulaic openers, generic value props, unmistakable ChatGPT cadence."
3. **Broken handoff** — AI books meetings, but they don't convert because context/qualification is lost.

Additional systemic issues:
- **Lack of emotional intelligence** — aggressive upsell to churned customer, cheerful email to unsubscribed prospect
- **Relationship damage is permanent** — a bad AI email burns the relationship harder than a bad human email
- **"Set and forget" fails** — requires 15-20 hours/week human oversight to maintain quality

### 1.8 What Works: The Hybrid Model

The market has converged on a pattern:

| AI handles | Human handles |
|-----------|---------------|
| Research + enrichment | Judgment calls |
| Personalization drafting | Relationship building |
| Timing optimization | Complex objections |
| Initial touchpoints | Deal closing |
| Follow-up sequencing | High-value conversations |
| Lead scoring | Context that can't be scraped |

**Key metrics that matter** (not meetings booked):
- Meeting-to-opportunity conversion rate
- Opportunity-to-close rate
- Revenue per meeting

"Start small and validate: 1-2 reps, 200-500 accounts, one ICP segment, human-in-the-loop mode."

---

## Track 2: AI-Mediated Introduction / Networking Platforms

### 2.1 Lunchclub

**What it is:** AI superconnector for 1:1 professional video meetings. Founded 2018.

**Matching algorithm:** Proprietary multi-factor matching beyond location/industry. Learns from profile data, meeting duration, and post-meeting feedback. Algorithm improves with more data and connections.

**Trust model:** "Club points" system — earned through meetings and referrals, spent on customization. Referral-gated onboarding weeds out uncommitted users. Invite-only exclusivity as quality filter.

**Network bootstrapping:** Invite-only model. Referrals from existing members. Points incentivize participation (meetings, referrals).

**Patterns worth studying:**
- **Post-meeting feedback loop** — binary signal (useful/not useful) feeds match quality
- **Points as trust currency** — engagement earns reputation
- **Invite-only as quality gate** — referral chain maintains network health
- **Algorithm learns from outcomes, not just profiles** — behavioural signal > declared preference

**Gaps (Ditto-relevant):**
- Matches strangers, not warm intros — no existing relationship context
- No professional/business outcome focus — networking for networking's sake
- No AI intermediary character — the platform is faceless
- No relationship continuity after the meeting

### 2.2 Commsor (Go-to-Network)

**What it is:** Go-to-Network (GTN) platform. Surfaces real-life connections for warm introductions.

**Architecture:** Pulls data from Slack, LinkedIn, CRM into unified member profiles. Identifies who in your network can facilitate a warm intro to a target.

**Trust model:** Warm introductions have 3% no-show rate (vs 25% for cold calls). Network-referred prospects convert 3-5x vs cold outbound. Trust is inherited from the introducing party.

**Key insight:** "Go-to-Network isn't a template, checklist, or playbook. It's a shift in mindset."

**Patterns worth studying:**
- **Existing relationship surfacing** — finds connections you already have but don't realize
- **Multi-source data integration** (Slack, LinkedIn, CRM) for relationship mapping
- **Warm intro metrics** — 3% no-show, 3-5x conversion. This is the benchmark Ditto should target.
- **Community-as-pipeline** — turns existing network into revenue driver

**Gaps (Ditto-relevant):**
- Surfaces connections but doesn't make them — human still does the intro
- No AI character/intermediary
- No proactive relationship building — reactive/discovery only
- Enterprise GTM tool, not SMB

### 2.3 LinkedIn AI Features

**What it is:** LinkedIn has added AI-powered features for networking and sales.

**Patterns worth studying:**
- Largest professional graph in the world — relationship data at scale
- Sales Navigator for targeted prospecting
- InMail as introduction channel (low trust, high volume = low response rates)

**Gaps (Ditto-relevant):**
- Platform-locked — can't take relationships off LinkedIn
- No AI intermediary or character
- InMail trust problem: no reputation stake for the sender
- No proactive relationship nurture

### 2.4 Introduction Broker Anti-Patterns

Across all platforms studied, recurring failures in AI-mediated introductions:

1. **Volume over quality** — more intros ≠ better outcomes. Lunchclub's invite-only was an explicit counter.
2. **No consequence for bad intros** — LinkedIn InMail has no reputational cost. Lunchclub's point system was a partial fix.
3. **Faceless intermediary** — when the platform is just a matching algorithm, neither party feels obligation. The human super-connector works because THEY have a reputation.
4. **No relationship continuity** — intro → meeting → gone. No follow-up, no "how did it go?", no compounding.
5. **Declared preferences vs revealed behaviour** — what people say they want in connections ≠ what actually works. Lunchclub learned this and shifted to outcome-based learning.

---

## Track 3: Email Deliverability Infrastructure (2026)

### 3.1 Current State

As of March 2026:
- **Authentication is mandatory** — SPF, DKIM, DMARC properly configured or emails are REJECTED (not spam-foldered, rejected) by major providers
- **Safe daily send limit per mailbox:** 50-100 cold emails
- **Mailbox rotation required:** 3-5 minimum sending mailboxes per sender, each doing 50-75/day
- **Domain warming:** 4-6 weeks gradual ramp. Start at 10-20 emails/day.
- **Engagement-based filtering:** Spam filters measure engagement beyond opens — replies, clicks, deletes, time-in-inbox

### 3.2 Infrastructure Stack

Standard cold email infrastructure in 2026:

| Component | Purpose | Tools |
|-----------|---------|-------|
| Domain management | Separate sending domains from primary | Multiple domains, rotating |
| Authentication | SPF/DKIM/DMARC | DNS config |
| Warmup | Build sender reputation | Instantly, Mailreach, Mailforge |
| Sending | Distribute across mailboxes | Mailbox rotation (3-5 per sender) |
| Tracking | Opens, replies, bounces | Built into platforms |
| Reputation monitoring | Sender score, blacklist checks | Google Postmaster, MxToolbox |

### 3.3 Implications for Ditto

Ditto's model (5 great emails/week, not 500) is structurally advantaged:
- Low volume = easier deliverability
- High personalization = better engagement signals
- Relationship continuity = reply chains (best deliverability signal)
- BUT: still needs proper authentication, warming, and dedicated sending domains

---

## Track 4: Voice Agent Platforms (2026)

### 4.1 Market Overview

Four platforms dominate:

| Platform | Specialization | Latency | Differentiator |
|----------|---------------|---------|----------------|
| **ElevenLabs** | Voice quality | Sub-100ms | 11,000+ voices, 70+ languages |
| **Vapi** | Multi-provider flexibility | Varies | Connect any LLM/TTS/STT provider |
| **Retell AI** | Enterprise compliance | ~600ms | Structured dialog flows |
| **Bland** | High-volume outbound sales | Varies | Purpose-built for sales calls |

### 4.2 Patterns Worth Studying

- **ElevenLabs** — sub-100ms latency is the benchmark for "feels real-time"
- **Vapi** — multi-provider flexibility maps to Ditto's no-vendor-lock-in principle
- **Retell** — structured dialog flows for skill-switching (onboarding → sales → nurture)
- **Bland** — purpose-built sales voice agent, most aligned with Ditto's outbound use case

### 4.3 Key Technical Decisions (Deferred to Brief 079+)

- Voice infra should be an integration, not a build
- Vapi's multi-provider model most aligned with Ditto's architecture (LLM-agnostic)
- Sub-200ms response time is the floor for "super low latency"
- Skill-switching during calls is a routing problem, not a voice problem

---

## Cross-Cutting Analysis

### What Exists That Ditto Can Build FROM

| Pattern | Source | Composition level |
|---------|--------|-------------------|
| Conversational onboarding → knowledge base | Artisan (Ava) | **Pattern** — study the 10-min intake, implement Ditto's way |
| Waterfall enrichment (multi-source) | Clay | **Pattern** — sequential data resolution for person enrichment |
| AI web research agent | Clay (Claygent) | **Pattern** — autonomous website research per prospect |
| Post-interaction feedback → match quality | Lunchclub | **Pattern** — outcome signal feeds future decisions |
| Warm intro conversion metrics | Commsor | **Pattern** — 3% no-show, 3-5x conversion as benchmarks |
| Relationship graph from existing data | Commsor | **Pattern** — pull from email, calendar, CRM, LinkedIn |
| Multi-agent architecture per task | 11x | **Pattern** — specialized sub-agents for research, drafting, sending |
| Email deliverability infrastructure | Industry standard | **Depend** — use existing warmup/authentication tools |
| Voice agent runtime | Vapi / ElevenLabs | **Depend** — integrate, don't build voice infra |
| Hybrid AI+human model | Industry consensus | **Pattern** — supervised → spot-checked → autonomous maps directly to Ditto trust tiers |

### What Is Original to Ditto

1. **AI as named intermediary with institutional reputation** — No platform has an AI character that makes introductions as itself, with a reputation that compounds. All existing tools either ghostwrite (as the user) or are faceless (the platform matches). Ditto's "Alex from Ditto" is genuinely novel.

2. **Mode-shifted alignment (Self / Selling / Connecting)** — No existing tool shifts optimization target based on context. SDR tools always optimize for the user. Networking platforms always optimize for "both parties." Ditto does both, and the user knows and consents to the asymmetry.

3. **Network effect on outreach quality** — Existing AI SDR tools are single-tenant. Every user's intelligence is isolated. Ditto's shared person graph means: the more users, the better Ditto knows who wants what, and the better introductions become for everyone.

4. **Refusals as trust-building** — No existing platform explicitly refuses to make introductions on behalf of its own users and frames this as a feature. Lunchclub's invite-only is the closest analogue, but it's a one-time gate, not an ongoing quality filter.

5. **Relationship-first outreach for SMB** — The entire AI SDR market targets enterprise sales teams doing volume. No tool is designed for an SMB owner who needs 5 great connections/month, not 500 cold emails/day.

6. **Cross-instance person memory** — Ditto remembers every interaction with every person across every user. If Alex introduces Person A to User 1 this month, and User 2 needs Person A next quarter, Ditto has relationship context. No existing tool does this.

7. **Progressive trust tiers governing AI-generated external communication** — Enterprise sales tools have tiered human approval workflows (manager approval for new reps, none for senior). Ditto's novelty is applying progressive, earned trust tiers to AI-generated outreach specifically — where the agent earns autonomy through demonstrated quality, not human seniority. The closest AI analogue is Artisan moving to autonomous sending, but that was a binary switch, not a progressive earn.

### Gap Analysis: Where No Solution Exists

| Gap | Description | Ditto impact |
|-----|-------------|--------------|
| **AI character as reputation holder** | No AI agent operates with its own professional identity and compounding reputation | Core differentiator — must be designed from scratch |
| **Cross-user relationship intelligence** | No platform shares interaction intelligence across users (privacy-preserving) | Network layer — requires novel privacy architecture. **Note:** This is the most architecturally sensitive gap. Requires dedicated privacy/legal research before design — not just a technical architecture decision. |
| **Quality-over-volume outreach for SMB** | All tools optimise for scale; none for "5 perfect emails" | Product positioning — not a technical gap |
| **Proactive relationship nurture** | AI checks in, follows up, maintains warmth — beyond sequences | Process design — uses existing heartbeat/process primitives |
| **Introduction refusal system** | Pre-send quality gate that sometimes says no | Trust tier + review pattern — novel application of existing Ditto primitives |

---

## Findings Relevant to Brief 079 (Network Agent MVP)

1. **Start supervised, earn trust** — Market data overwhelmingly supports this. Autonomous AI outreach has 50-70% churn. Hybrid (supervised) has 2.3x revenue. Ditto's trust tier model is the correct architecture.

2. **Email-first is correct** — Lowest infrastructure risk, highest personalization potential, established deliverability patterns. Voice deferred.

3. **Person-scoped memory is the moat** — Every tool surveyed lacks relationship continuity. This is where Ditto compounds advantage.

4. **Low volume, high quality** — 5 emails/week with deep personalization will outperform 500 generic ones. Market data supports this (hybrid model metrics).

5. **The named AI intermediary is genuinely novel** — No competitor does this. It's the highest-risk, highest-reward design decision. Recipient reaction to "Alex from Ditto" is the first thing to test.

6. **Deliverability needs early investment** — Even at low volume, authentication (SPF/DKIM/DMARC), dedicated domains, and warming are non-negotiable in 2026.

7. **Post-interaction feedback is critical** — Lunchclub's key insight: algorithm quality comes from outcome signals, not profile matching. Ditto must capture "did this introduction/outreach lead to something useful?" from both sides.

---

## Sources

### AI SDR/BDR
- [11x Alice — AI SDR](https://www.11x.ai/worker/alice)
- [11x Multi-Agent Architecture — ZenML](https://www.zenml.io/llmops-database/rebuilding-an-ai-sdr-agent-with-multi-agent-architecture-for-enterprise-sales-automation)
- [11x AI Review 2026 — MarketBetter](https://marketbetter.ai/blog/11x-ai-review-2026/)
- [Artisan AI — AI BDR](https://www.artisan.co/ai-sales-agent)
- [Artisan AI Review — Salesforge](https://www.salesforge.ai/blog/artisan-ai-review)
- [Clay — Data Enrichment Platform](https://www.clay.com/)
- [Clay Review 2026](https://work-management.org/crm/clay-review/)
- [Clay + OpenAI Case Study](https://openai.com/index/clay/)
- [Apollo.io Review 2026](https://lagrowthmachine.com/apollo-io-review/)
- [Relevance AI — BDR Agent](https://relevanceai.com/blog/outbound-bdr-agent-how-relevance-ai-automates-sales-research-and-outreach)
- [AI SDR Bubble Popping — GTM AI Podcast](https://www.gtmaipodcast.com/p/the-ai-sdr-bubble-is-popping-heres)
- [Are AI SDRs Worth It — UserGems](https://www.usergems.com/blog/are-ai-sdrs-worth-it)
- [AI SDR Playbook 2026 — Product Growth](https://www.productgrowth.blog/p/the-ai-sdr-playbook-what-actually-works)
- [Artisan AI Reviews — Coldreach](https://coldreach.ai/blog/artisan-ai-review)
- [AI SDR Hybrid Model — Monday.com](https://monday.com/blog/crm-and-sales/will-ai-replace-sdrs/)

### Introduction / Networking Platforms
- [Lunchclub — AI Networking](https://lunchclub.com/)
- [Lunchclub — Lightspeed Analysis](https://medium.com/lightspeed-venture-partners/lunchclub-the-future-of-professional-networking-429b25d82bb1)
- [Lunchclub — Making Connections with AI](https://medium.com/lunchclubai/making-connections-with-ai-one-lunch-at-a-time-a3df58c0a7ed)
- [Commsor — Go-to-Network](https://www.commsor.com/)
- [Commsor — Warm Introduction Guide 2025](https://www.commsor.com/post/warm-introduction)
- [Commsor — GTN Future of Growth](https://www.commsor.com/post/go-to-network-future-of-growth)

### Email Deliverability
- [Domain Warming Best Practices 2026 — Mailforge](https://www.mailforge.ai/blog/domain-warming-best-practices)
- [Cold Email 2026 — Unify](https://www.unifygtm.com/explore/cold-email-2026-domain-setup-deliverability-sequences)
- [Cold Email Benchmark Report 2026 — Instantly](https://instantly.ai/cold-email-benchmark-report-2026)
- [Email Deliverability Ultimate Guide 2026 — Mailreach](https://www.mailreach.co/blog/cold-email-deliverability-sending-strategy)
- [Cold Email Best Practices 2026 — PowerDMARC](https://powerdmarc.com/cold-email-best-practices/)

### Voice Agents
- [Voice AI Agent Platforms Guide 2026 — Vellum](https://www.vellum.ai/blog/ai-voice-agent-platforms-guide)
- [Voice AI Agents: ElevenLabs vs Vapi vs Retell — Digital Applied](https://www.digitalapplied.com/blog/voice-ai-agents-business-elevenlabs-vapi-retell-bland)
- [Best Voice AI Agent Platforms — Retell](https://www.retellai.com/blog/best-voice-ai-agent-platforms)
- [AI Voice Agents Ranked 2026 — Lindy](https://www.lindy.ai/blog/ai-voice-agents)

### Market Context
- [AI SDR Buying Guide 2026 — Autobound](https://www.autobound.ai/blog/ai-sdr-buying-guide-2026)
- [Top AI SDR Platforms 2026 — Landbase](https://www.landbase.com/blog/top-ai-sdr-platforms-in-2025)
- [AI SDRs: What Works, What Fails 2026 — Prospeo](https://prospeo.io/s/ai-sdrs)
