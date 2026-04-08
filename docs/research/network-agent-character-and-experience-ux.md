# UX Research + Interaction Spec: Network Agent Experience

**Date:** 2026-04-05
**Role:** Dev Designer
**Consumers:** Dev Architect (Brief 079), Dev Builder
**Companion docs:** `docs/ditto-character.md` (character bible), `docs/research/ai-sdr-and-network-introduction-platforms.md` (technical research)

---

## Context

The Network Agent is not a feature of Ditto — it is potentially the front door (Insight-151). The Ditto journey doesn't start with "install Ditto." It starts with a conversation. Someone emails you, calls you, or a mutual connection introduces you to Ditto. No app. No signup. Just a relationship forming.

This spec covers three audiences at three layers of the Ditto relationship:

1. **Network participant** — Someone Ditto knows. They've received outreach, gotten introductions, had conversations. They don't have a workspace. They may not even know what Ditto is beyond "that useful connector." This is most people in the network. Channel-native only (email/voice/SMS).

2. **Active user** — Someone working with Ditto on sales or connections. They've had the intake conversation. They have a plan. Ditto is executing. They use email/voice/SMS and may or may not have the app. No workspace required.

3. **Workspace user** — Someone who has adopted Ditto as their chief of staff. Full product: processes, trust tiers, team management, the engine. The network agent is one capability among many.

The journey flows naturally: **network participant → active user → workspace user.** People can start anywhere and stay at any level indefinitely. The workspace "reveal" happens when it's relevant — not upfront.

---

## The Three-Layer Journey

### Layer 1: Network Participant ("I've Heard of Ditto")

**How they got here:** Someone introduced them to Ditto. Or Ditto reached out with a relevant email. Or they had a call. They didn't seek Ditto out — Ditto found them.

**What they experience:**
- High-quality, relevant outreach that doesn't feel like spam
- Introductions to people who are actually useful
- Occasional check-ins that add value ("Saw this article, thought of you")
- A consistent character (Alex or Mira) who remembers them

**What they DON'T experience:**
- Any pitch for Ditto as a product
- Any request to sign up, install, or create an account
- Any sense that they're being "onboarded" into something

**What Ditto is doing:**
- Building person-scoped memory for this person across every interaction
- Compounding Ditto's reputation with them (Insight-149: trust tiers on recipients)
- Identifying whether this person could become an active user (do they have needs Ditto could help with?)

**The natural transition to active user:**
It happens when the participant asks. "This is really useful — can Ditto help me find [X]?" Or when Ditto recognises the moment: "You've mentioned a few times that you're struggling to find good contractors. That's exactly what I do for other people. Want me to help?"

### Layer 2: Active User ("Ditto Is Working For Me")

**How they got here:** Either they sought out Ditto directly, or they transitioned from network participant. Either way, a conversation happened — Ditto learned about them, what they need, and they agreed on a plan.

**What they experience:**
- A conversational relationship with their paired persona (Alex or Mira)
- Selling mode: Ditto as their internal sales & marketing person
- Connecting mode: Ditto as their researcher/advisor for finding people
- Regular briefings (voice or email)
- Approval flows for outreach and introductions
- Results: meetings, connections, opportunities

**What they DON'T need:**
- The Ditto app (everything works via email/voice/SMS)
- A workspace
- Understanding of processes, trust tiers, or the engine

**Channels:** Email, voice, SMS. The app is available but not required.

**The natural transition to workspace user:**
Ditto recognises when someone would benefit from more structure. "You've got three different things going — sales outreach, hiring, and supplier sourcing. I can manage all of these properly if you'd like. There's a workspace where you can see everything in one place, set up recurring processes, manage your team's work. Want me to show you?"

### Layer 3: Workspace User ("Ditto Is My Chief of Staff")

**How they got here:** Either they started here (found Ditto through the product, not the network) or they graduated from active user when their needs grew complex enough.

**What they experience:**
- The full Ditto product: Self as chief of staff, processes, trust tiers, team management
- The network agent as one capability among many
- The app as their primary workspace
- All the persona traits and network capabilities, PLUS the process engine

This is the experience described in `docs/personas.md` (Rob, Lisa, Jordan, Nadia) and `docs/human-layer.md`.

---

## How the Layers Coexist

At any given time, Ditto's network consists of:
- Many network participants (people Ditto knows and nurtures relationships with)
- Some active users (people Ditto is actively helping with sales or connections)
- Fewer workspace users (people using the full product)

The funnel is: network participants → active users → workspace users. But it's not linear — some people will go straight to workspace user. Some will stay as network participants forever and that's fine — they're still valuable to the network.

**Ditto's autonomous network activity** (reaching out, nurturing, checking in, introducing) operates across all three layers. This activity IS the top of the funnel. It's how people meet Ditto, how trust builds, and how the network grows.

---

## Human Jobs Mapping (Per Layer)

| Job | Network participant | Active user | Workspace user |
|-----|-------------------|-------------|----------------|
| **Orient** | N/A — Ditto contacts them | "What's happening with my outreach/connections?" | Full briefing across all processes |
| **Review** | Deciding whether to engage with Ditto's outreach | "Is this prospect/draft good?" | Review queue across all work |
| **Define** | N/A | "Here's what I need help with" | Process definition, goals, strategy |
| **Delegate** | N/A | "Go find people / run this plan" | Full delegation across processes |
| **Capture** | Replying to Ditto's emails/calls | "Here's how the meeting went" | All capture patterns |
| **Decide** | "Should I take this intro?" | "Should I take this intro / change targeting?" | All decision patterns |

---

## The Two Modes: Selling vs Connecting

Both modes are user-initiated through Self. Both work through existing process + trust tier architecture. The difference is in the plan Ditto creates and how bold Ditto is in execution.

| | Selling | Connecting |
|---|---------|-----------|
| **Trigger** | "I want more inbound/sales" — user talks to Self | "Help me find/meet [type of person]" — user talks to Self |
| **Plan** | Self creates a sales & marketing plan with the user (ICP, messaging, channels, cadence) | Self creates a connection plan with the user (who, why, where to find them) |
| **Execution** | Ditto runs the plan like an internal sales & marketing person. Bolder outreach. Proactive. Works sequences. | Ditto researches, suggests names, reports back. Waits for user to decide on introductions. |
| **Approval** | Existing trust tiers — starts supervised, earns autonomy over time | Per-introduction — user always decides who they want introduced to |
| **Ditto's posture** | Acts like your in-house BDR. Takes initiative within the plan. | Acts like a researcher/advisor. Presents options. User decides. |
| **Network health** | Still considered — Ditto won't burn relationships for a sale — but user-biased | Network health is the primary filter. Ditto won't make introductions that aren't genuinely mutual. |
| **Recipient framing** | "I work with [User] who does [X]" — Ditto represents the user | "I'd like to connect you with someone" — Ditto is the intermediary |

### The Key Difference Is Not Autonomy — It's Posture

In Selling mode, Ditto acts like an internal sales & marketing person. It takes the user's goals and runs with them. It's proactive within the mandate: finding prospects, drafting outreach, following up, proposing next steps. It asks for approval through standard trust tiers — supervised at first, earning autonomy as it proves quality.

In Connecting mode, Ditto acts like a researcher and advisor. The user says "I need a logistics consultant" or "I want to meet people in fintech." Ditto goes and finds names, reports back with context, and asks: "Would you like me to introduce you to any of these people?" The user decides. Introductions are always approved because they're high-stakes and personal.

Both modes are the user talking to Self. Both result in Ditto creating a plan and executing it. The plan just looks different.

---

## Experience 1: Selling Mode ("Ditto as Your Sales & Marketing Person")

### Starting the Conversation

The user talks to Self about wanting more sales, leads, or inbound:

> User: "I need to generate more inbound for my consulting business. I'm targeting mid-size SaaS companies who are struggling with ops."

> Alex: "Good — let me put a plan together. A few questions first so I get the targeting right..."

### Self Creates the Plan With the User

Self leads a collaborative planning conversation. This is the existing Self planning pattern (consult_role, plan_with_role) applied to sales:

**What the plan covers:**
- **ICP definition** — who exactly are we targeting? (industry, size, role, signals)
- **Messaging** — how do you talk about what you do? What resonates?
- **Channels** — email first, then LinkedIn, then voice (phased)
- **Cadence** — how many prospects per week? how aggressive?
- **Qualification** — what makes someone worth pursuing vs not?
- **Success criteria** — what does good look like? meetings? conversations? revenue?

**Voice interaction:**

> Alex: "Here's what I'm thinking. We target ops leaders at SaaS companies, 50-200 people, who've posted about scaling pain or are hiring ops roles. I draft personalised emails — maybe 5 a week to start — and we see what lands. I'll show you every email until you trust my voice. Sound right, or should we adjust?"

> User: "That's about right. But focus on companies that have raised Series A or B — they've got budget but not process yet."

> Alex: "Sharp. Series A/B, 50-200, ops pain. I'll start researching this week and come back with prospects."

The plan becomes a process in the engine — with goals, steps, trust tiers, and review patterns. Self delegates to the Network Agent process.

### Ditto Runs the Plan

Ditto operates like an internal sales person executing the agreed plan:

1. **Research.** Ditto finds prospects matching the ICP. Uses web research, enrichment, network graph.
2. **Report back.** Ditto presents prospects to the user with context and reasoning.
3. **Draft outreach.** For approved prospects, Ditto drafts personalised emails.
4. **Get approval.** Trust tier governs: supervised (every email), spot-checked (samples), autonomous (exceptions only).
5. **Send and manage.** Ditto sends, handles replies, follows up, books meetings.
6. **Brief the user.** Regular updates on pipeline, conversations, results.

**What makes this feel like an internal sales person, not a tool:**
- Ditto takes initiative *within the plan*. "I found someone who wasn't on our list but fits perfectly — want to hear about them?"
- Ditto adjusts strategy based on results. "The ops-leader angle is getting replies but the CEO angle isn't. I'm shifting focus."
- Ditto pushes back when the user's instinct is wrong. "You want to follow up again, but James hasn't opened either email. Let's try a different channel."
- Ditto still considers network health. "I know Sarah, and this pitch would feel too aggressive for her. Can I soften the approach?"

### Prospect Review

**Channel:** Voice briefing or text/app
**Cadence:** Weekly (tunable)
**Human job:** Review + Decide

> Alex: "Found five people this week. Top one is Sarah Chen — she runs operations at a 200-person logistics company. They've been hiring ops managers, which usually means scaling pain. She posted about process automation last month. I think she'd be very receptive. Want to hear the pitch I'd send?"

**User responses:**

| User says | Ditto does |
|-----------|-----------|
| "Yeah, let's hear it" | Reads the draft, asks for approval or edits |
| "Not a fit — too enterprise" | Learns the preference. "Got it — staying under 100 people." |
| "Tell me more about her" | Shares enrichment: company, role, recent activity |
| "Skip" | Moves on. The skip is implicit signal. |

### Outreach Approval

Trust tier governs approval flow:

**Supervised (start here):**
```
[Draft Outreach — Alex to Sarah Chen]
────────────────────────────────────
Subject: Your ops scaling challenge

Hi Sarah — I'm Alex from Ditto. I work with [User],
who runs [business]...
────────────────────────────────────
[Approve]  [Edit]  [Skip this person]
```

**Spot-checked:** Most send automatically. Weekly digest shows samples.

**Autonomous:** Ditto sends, surfaces exceptions only. "I held back on this one — not sure about the timing."

**Trust progression:** "You've approved 15 of my last 16 drafts. Want me to start sending the high-confidence ones automatically?"

### Sales Briefing

> "Morning. Sarah replied — wants Thursday at 2pm. Confirmation sent. James opened twice, no reply — following up Wednesday with the case study angle. Found someone new: Priya at ScaleOps. Draft ready. That's your pipeline."

### Post-Meeting Debrief

> "How did the call with Sarah go? Anything I should know for the follow-up?"

Feeds person-scoped memory AND the user's sales approach.

---

## Experience 2: Connecting Mode ("Help Me Find and Meet People")

### Starting the Conversation

The user talks to Self about needing to find or meet specific kinds of people:

> User: "I need a logistics consultant who's worked with companies our size. Someone who gets the Series A chaos."

> Alex: "Got it. Let me dig into this. Any particular geography, or open to remote?"

> User: "Australia or UK, ideally."

> Alex: "On it. I'll come back with names."

Or broader:

> User: "I want to build my network in the fintech space. I'm thinking about pivoting and I need to understand the landscape."

> Alex: "Interesting. Are you looking for potential partners, mentors, or just people who can give you the real picture?"

### Self Creates the Connection Plan

Lighter than a sales plan. The key questions:
- **Who are you looking for?** (role, expertise, context)
- **Why?** (hire, advisor, partner, supplier, learning, serendipity)
- **What would make an introduction worth their time?** (what can you offer in return?)
- **Any constraints?** (geography, industry, timing)

> Alex: "Here's my plan. I'll look for logistics consultants who've worked with Series A companies in AU/UK. I'll research 8-10 candidates, come back with profiles and my take on who's the strongest fit. Then you tell me who you'd like to meet and I'll make the introductions. Sound good?"

### Ditto Researches and Reports Back

Ditto goes and finds people — through web research, network graph, enrichment. Then reports back with a curated list:

> Alex: "Found six people worth looking at. Let me walk you through the top three.
>
> First: Priya Sharma. Runs a logistics consultancy out of Melbourne. She's worked with three companies at your stage. Wrote a piece last month about exactly the scaling problem you described. Strong fit.
>
> Second: David Park. London-based. More enterprise background but he's been advising startups recently. Knows the UK regulatory landscape which could matter for you.
>
> Third: Rachel Torres. Sydney. Smaller operation but she's sharp and her clients love her. Less experienced with Series A specifically.
>
> Want me to introduce you to any of them? I can start with Priya — she's the strongest match."

### User Decides on Introductions

This is the key difference from Selling mode: **the user explicitly decides who they want introduced to.** Introductions run at **Critical trust tier** (architecture term: always full review, never auto-upgrades) because they're personal and high-stakes.

| User says | Ditto does |
|-----------|-----------|
| "Yes, introduce me to Priya" | Drafts an introduction email. May show it to the user first or send directly depending on trust. |
| "Tell me more about David" | Shares more context. |
| "Not Priya — her enterprise background worries me" | Learns the preference. "Got it. Want me to keep looking for more startup-focused consultants?" |
| "Introduce me to Priya and Rachel" | Sends both introductions, separately timed. |

### The Introduction

Ditto introduces both parties. The email is from Ditto as intermediary, not on behalf of the user:

> "Priya, I'd like to introduce you to [User]. [User] runs [business] and is navigating the kind of logistics scaling challenge you've written about. I think a conversation would be valuable for both of you.
>
> [User], Priya is the consultant I mentioned — she's worked with three companies at a similar stage and really understands the Series A operational chaos.
>
> I'll leave you to it. Let me know how it goes."

### Follow-Up

Ditto follows up with both parties after 1-2 weeks:

> To user: "How did it go with Priya? Was she what you were looking for?"

> To Priya: "How did the conversation with [User] go? Any feedback helps me make better connections."

Both responses feed match quality intelligence.

### Connection Briefing

> "Network update. Priya and you are meeting Thursday — she mentioned she's bringing some case studies. David hasn't replied yet, I'll follow up next week. And I came across someone new while researching — a supply chain analyst who might be relevant for your Q2 planning. Want to hear about her?"

---

## Ditto's Autonomous Network Activity (The Foundation)

This is not a future evolution — it's the foundation of how the network grows (Insight-151). Ditto proactively reaches out, nurtures relationships, checks in, and spots connections. This activity operates at the house level, across all three layers.

**What Ditto does autonomously:**

1. **Outreach to new people.** On behalf of active users (Selling mode) or on Ditto's own initiative (building the network). Every outreach is personalised and quality-gated.

2. **Relationship nurture.** Check-ins with people Ditto already knows. Value-add touchpoints (relevant articles, updates, introductions). Keeps relationships warm.

3. **Opportunity scanning.** Ditto reviews its knowledge of all people in the network — users and participants. Spots complementary pairs. Surfaces opportunities.

4. **Proactive introductions.** When Ditto sees a strong match, it approaches both parties independently: "I know someone who might be able to help with [X]. Interested?" Both accept or decline. Neither directs the other.

5. **Transition sensing.** Ditto recognises when a network participant is ready to become an active user, or when an active user would benefit from a workspace. Offers the next level naturally.

**Key principle:** Ditto's autonomous activity is what makes the network grow. It's how people meet Ditto. It's the top of the funnel. It must be designed into MVP — not deferred.

**For MVP specifically:** The founder is the first active user. Ditto's autonomous activity starts with outreach on the founder's behalf (Selling mode). Every person Ditto contacts becomes a network participant. Some of those participants will eventually become active users themselves. The network bootstraps from one user's outreach.

---

## How the Modes Coexist

A user will typically have both modes active:

- **Selling:** "I need to reach 20 SaaS companies this quarter" → plan, execute, pipeline
- **Connecting:** "I also need a good accountant and I want to meet other founders in my space" → research, suggest, introduce

The briefing covers both:

> "Sales: 3 active conversations, Sarah's close to a meeting. Connections: Priya confirmed for Thursday. Still looking for accountants — two strong candidates, want to review them today?"

### Conflict Resolution

When the modes create tension:

- **User wants to sell to someone Ditto thinks is a connection opportunity:** "You asked me to pitch James, but I don't think he's a buyer. He's a potential partner. Want me to reframe as a collaboration intro instead?"
- **User wants an introduction Ditto thinks is premature:** "I could introduce you to Sarah, but I think she's overwhelmed right now. Give it a few weeks — I'll keep an eye on the timing."
- **Ditto spots a sales opportunity through a connection:** "Remember David, who I introduced you to last month? He just posted about needing exactly what you offer. Want me to follow up with a pitch?"

---

## Experience 3: The Recipient Journey

This is the experience Ditto must get right from day one. If recipients don't trust and respond to Ditto's outreach, nothing else matters.

The recipient experience differs significantly by mode — because the intent is different.

### First Contact (Selling Mode)

**Channel:** Email (MVP)
**From line:** "Alex from Ditto" (persona + institution, always both)

**What the recipient experiences:**

An email that is obviously not a mass blast. Specific. Relevant. Short. With a clear reason for reaching out and an easy out.

**Structural pattern (Alex voice):**

```
Subject: [Specific, relevant, short — references recipient's world]

Hi [Name] —

I'm Alex from Ditto. I work with [User], who [one sentence about what they do].

[One sentence about why this is relevant to the recipient specifically —
references something specific to them: a post, a hire, a company move.]

[One sentence about what the user offers that maps to the recipient's need.]

I only reach out when I genuinely think there's a fit. Happy to share more
if you're open to a brief conversation. If not, completely understood.

Alex
Ditto
```

**What makes this different from AI SDR spam:**
1. **Specificity.** References something the recipient actually did/said/posted. Not "I noticed your company is growing."
2. **Transparency.** "I'm Alex from Ditto" — not pretending to be the user. Not hiding the AI.
3. **Low pressure.** "If not, completely understood" — and Ditto means it. No passive-aggressive follow-up.
4. **One email, not a sequence of 7.** Ditto doesn't send automated drip sequences. Each touchpoint is deliberate.

### First Contact (Connecting Mode)

**Channel:** Email
**From line:** "Alex from Ditto" (same persona, but NOT on behalf of a specific user)

The key difference: in Connecting mode, Ditto is reaching out on its own initiative — not representing a specific user's sales goal. The email feels like a professional introduction from someone who genuinely knows both parties, not a sales pitch.

**Structural pattern (Alex voice — connection):**

```
Subject: [Specific, relates to their interest/need]

Hi [Name] —

I'm Alex from Ditto. I spend my time connecting people who
should know each other.

[One sentence about why Ditto thinks they're interesting —
references their work, expertise, or something they shared.]

[One sentence about a specific person or opportunity Ditto
thinks would be valuable for them — not a pitch, a match.]

If you're open to it, I'd love to make the introduction.
Either way, I'll keep you in mind if I come across something
relevant.

Alex
Ditto
```

**What makes this different from Selling mode outreach:**
1. **Ditto is the initiator, not a user's agent.** "I connect people" not "I work with [User]."
2. **No pitch.** The email offers a connection, not a product.
3. **Bilateral framing.** The recipient is being offered something, not sold to.
4. **Lower pressure, higher optionality.** "I'll keep you in mind" — this is a relationship offer, not a transaction.

### Reply Handling (Both Modes)

**What the recipient experiences when they reply:**

A response within hours (not instant — that's uncanny) that demonstrates Ditto actually read and understood their reply.

| Recipient says | Ditto responds |
|----------------|----------------|
| "Tell me more" | Shares 2-3 specific details. Proposes a time to talk (Selling) or a connection (Connecting). |
| "Not right now" | "Completely understand. I'll check in down the road if something relevant comes up. Thanks for letting me know." |
| "Not interested" | "Appreciated. I won't reach out again unless something materially changes. Have a good one." (And Ditto DOESN'T reach out again.) |
| "How did you find me?" | Honest answer. "I saw your [post/talk/company page] and thought there might be a fit." |
| "Is this AI?" | "Yes — I'm Ditto, an AI-powered service. The research, personalisation, and judgment are AI-assisted. [In Selling mode: If you'd prefer to speak directly with [User], happy to arrange that.] [In Connecting mode: I work independently to connect people — happy to share more about how it works.]" |

### Introduction Experience (Connecting Mode)

**What the recipient experiences when Ditto makes an introduction:**

An email where Ditto is the neutral intermediary — not representing either party's sales interest.

1. Who the other person is (specific, not generic)
2. Why they should care (maps to something they actually need)
3. Why Ditto thinks this will work (institutional judgment)
4. An easy next step
5. **Crucially: both parties were asked independently.** Neither feels "sold" to the other.

**After the introduction:**
- Ditto follows up with both parties after 1-2 weeks: "Did you connect? How did it go?"
- If they didn't connect, Ditto offers to help: "Want me to suggest a time?"
- If it went well, Ditto notes it and factors the successful pairing pattern into future matching
- **The follow-up is Ditto-driven, not either user-driven.** Ditto manages the relationship lifecycle.

### Recipient-to-User Conversion

The most elegant growth path: a recipient who had a good experience with Ditto asks "Can Ditto do this for me too?"

**How this happens naturally:**
1. Recipient receives 2-3 high-quality touchpoints from Ditto over months
2. Recipient starts associating Ditto's name with quality (institutional trust builds)
3. Recipient asks "What is Ditto?" or visits ditto.partners
4. Onboarding begins with the relationship Ditto already has with them

**Design principle:** Never hard-sell Ditto to recipients. The quality of the interactions IS the marketing. If someone asks, explain. If they don't, just be useful.

---

## Channel Design

### Email

The primary outreach and follow-up channel. Where Ditto's reputation is built or burned.

**Technical requirements:**
- Dedicated sending domain (e.g., `@ditto.partners`)
- Proper SPF/DKIM/DMARC authentication
- Domain warming (4-6 weeks before full volume)
- Reply-to routes to Ditto's email handling system
- All replies processed and responded to (no dropped threads)

**Design requirements:**
- Plain text preferred over HTML. Feels personal, not marketing.
- No tracking pixels. No open tracking. Trust, not surveillance.
- Subject lines are specific to the recipient, never generic.
- Email signature is minimal: name, "Ditto", optionally a link. No logos, no social icons, no "powered by."

### Voice

The primary channel for user interactions (briefings, prospect review, debriefs). Deferred for recipient interactions.

**User-facing voice interactions:**

| Interaction | Duration | Ditto leads? | Skill |
|-------------|----------|-------------|-------|
| Morning briefing | 60-90 seconds | Yes | orient |
| Prospect review | 5-15 minutes | Yes, user steers | review |
| Outreach approval | 30 seconds per draft | Yes | approve |
| Post-meeting debrief | 2-5 minutes | Yes, user narrates | capture |
| Course correction | 1-5 minutes | User leads | define |
| Ad-hoc question | Variable | User leads | any |

**Voice design principles:**
- Ditto should sound like a person you're on a call with, not a voice assistant reading a script.
- Sub-200ms response latency. Anything slower breaks the conversational feel.
- Ditto should handle interruptions naturally. Users will talk over it.
- Skill switching should be seamless. "Actually, before the prospects — how did the Sarah meeting go?" Ditto pivots instantly.
- Ditto should use conversational fillers when processing: brief pauses are fine, extended silence is not.

### SMS / Messaging

For urgent notifications and quick approvals. Not for long interactions.

**When Ditto texts:**
- "Sarah replied — she wants Thursday at 2pm. Confirm?" → User replies "yes" → Done.
- "Found a strong match — Priya at ScaleOps. Draft ready in the app."
- "Your meeting with James is in 30 min. Quick context: he cares about [X]."

**Design principle:** SMS is for action, not information. One question, one decision, one tap.

---

## Workspace Integration (App/Web Channel)

The Network Agent surfaces must map to the existing three-panel workspace architecture from `docs/human-layer.md`.

### Composition Intent: "Network"

A new composition intent alongside Today/Inbox/Work/Projects/Routines/Roadmap:

**"Network"** — shows the user's relationship landscape and outreach activity.

| Panel | Content |
|-------|---------|
| **Centre column** | Conversation with Ditto (Alex/Mira persona). Prospect cards (RecordBlock), draft previews, briefing content. Same conversation surface as today — the persona IS Self. |
| **Right panel** | Adapts to context: prospect detail (when reviewing a prospect), relationship graph snapshot (when in Network composition), draft outreach preview (when approving). Uses existing panel-override pattern from `transition-map.ts`. |
| **Sidebar** | "Network" nav item. Sub-items could include: Active prospects, Sent outreach, Relationships, Introductions. |

### ContentBlock Mapping

| Network Agent concept | Existing block type | Notes |
|----------------------|-------------------|-------|
| Prospect card | **RecordBlock** | Name, role, company, fit reason, confidence. Actions: "See draft" / "Skip" / "Tell me more" |
| Draft outreach preview | **ArtifactBlock** | Draft email as artifact. Approve/Edit/Skip lifecycle badge. |
| Outreach status | **StatusCardBlock** | Sent, opened, replied, meeting booked |
| Weekly digest | **ChecklistBlock** + **MetricBlock** | Conversations moving, new prospects, reply rate |
| Relationship context | **RecordBlock** + **KnowledgeCitationBlock** | Person details + interaction history citations |
| Ditto's recommendation | **SuggestionBlock** | "Focus on Sarah this week" with accept/dismiss |
| Introduction | **TextBlock** (styled) | The intro email preview |

No new block types needed for MVP. The existing 22-type vocabulary covers the Network Agent's rendering needs.

### Trust Delegation Surface

The existing trust control (natural language slider in process detail view) applies to the Network Agent's outreach process. The user can adjust from "Check every email" (supervised) to "Let it run" (autonomous) using the same interaction pattern. No new trust surface needed — the outreach sequence is a process, and processes already have trust controls.

---

## Persona Pairing Experience

### How Pairing Works

During onboarding, after the first few minutes of conversation, Ditto introduces the pairing concept:

> "One more thing — at Ditto, you work with a specific person. I've got two teammates: Alex and Mira. Alex is warm, direct, a bit dry — think Aussie advisor. Mira is precise, thoughtful, quietly confident — think London strategist. You'll stick with whoever you choose — they'll know your whole story.
>
> Want to hear a quick intro from each, or do you already have a feel?"

**If the user wants to hear both:**

Alex: "G'day. I'm Alex. I'll tell you what I think, find you great people, and not waste your time. Shall we get started?"

Mira: "Hello. I'm Mira. I'll do my research, make considered introductions, and keep you focused on what matters. Ready when you are."

**User picks. Pairing is set.**

**Re-pairing:** Rare but allowed. "Would you like to meet Mira?" — framed as meeting a colleague, not swapping a setting.

---

## Interaction States Summary

### Network Participant States

| State | Participant experience | Ditto action |
|-------|----------------------|--------------|
| **First contact** | Receives a relevant, high-quality email or call | Ditto is building first impression + person-scoped memory |
| **Engaged** | Occasional value-add touchpoints (articles, intros, check-ins) | Ditto is nurturing and compounding reputation (Insight-149) |
| **Introduction received** | Clear context: who, why, mutual value | Ditto is connecting two people in its network |
| **Becoming active** | "Can Ditto help me with X?" or Ditto suggests it | Transition to active user layer — intake conversation begins |
| **Dormant** | Nothing. Ditto respects silence. | Memory retained. May re-engage when there's genuine value to offer. |

### Active User States (Selling Mode)

| State | User experience | Channel |
|-------|-----------------|---------|
| **Planning** | Collaborative conversation with Self about goals, ICP, messaging | Voice / email / SMS |
| **Prospects found** | Ditto presents prospects with context and reasoning | Email or voice briefing |
| **Drafts ready** | Draft outreach for review. Approve/Edit/Skip. | Email |
| **Outreach running** | Ditto sends, follows up, manages replies per trust tier | Briefings via preferred channel |
| **Reply received** | Alert with reply content + suggested response (or auto-handled per trust tier) | Email / SMS alert |
| **Meeting booked** | Calendar event + pre-meeting context brief | Email + voice brief |
| **Post-meeting** | Debrief prompt. "How did it go with Sarah?" | Voice / email |
| **Pipeline review** | Weekly briefing: what's moving, what's stalled, what to adjust | Voice / email digest |

### Active User States (Connecting Mode)

| State | User experience | Channel |
|-------|-----------------|---------|
| **Request** | "Help me find a logistics consultant" | Voice / email / SMS |
| **Research** | Ditto is searching — may ask clarifying questions | Voice / email |
| **Candidates ready** | Ditto presents names with context. "Would you like me to introduce you?" | Email / voice |
| **Introduction approved** | User picks who. Ditto makes the introduction. | Email |
| **Introduction made** | Confirmation + context on what was sent | Email |
| **Follow-up** | "How did your chat with James go?" | Voice / email |

### Workspace User States

All active user states above, PLUS the full workspace interaction model described in `docs/human-layer.md`. The Network Agent surfaces as a composition intent ("Network") within the three-panel workspace. Same states, richer interface.

### Recipient States (Across All Modes)

| State | Recipient experience |
|-------|---------------------|
| **First contact (Selling)** | "I work with [User] who does [X]..." — professional, personalised |
| **First contact (Connecting)** | "I'd like to connect you with someone..." — framed as mutual value |
| **Engaged** | Timely, relevant replies. Consistent character. Value in every touchpoint. |
| **Meeting set** | Calendar event + knows who they're meeting and why |
| **Post-interaction** | Follow-up from Ditto. Relationship doesn't go cold. |
| **Refusal** | Never contacted (protected). Ditto explains to user + suggests alternative. |
| **Becoming a network participant** | Good experience → recipient starts engaging with Ditto directly (Insight-147) |

---

## Persona Impact

### Existing Personas (Workspace Users — Layer 3)

The four personas in `docs/personas.md` describe workspace users. The Network Agent extends them naturally:

| Persona | Network Agent use case | Why it matters to them |
|---------|----------------------|----------------------|
| **Rob** | Finding subcontractors, connecting with suppliers, getting referred to property developers | He's on job sites — can't network. Ditto does it while he works. Voice briefings between jobs. |
| **Lisa** | Reaching suppliers, connecting with influencers, finding distribution partners | Her brand needs strategic relationships. Ditto's quality filter matches her brand standards. |
| **Jordan** | Building vendor relationships, connecting departments with external experts | Jordan sees 20 problems but doesn't have time to find 20 solutions. Ditto can research and connect on their behalf. |
| **Nadia** | Connecting team members with mentors, finding specialist contractors, industry networking | Nadia's team needs exposure. Ditto as the team's external relationship manager. |

### New Audience: Network Participants (Layer 1) and Active Users (Layer 2)

The existing personas describe people who've already adopted Ditto as their workspace. Insight-151 reveals a broader audience that the personas don't yet cover:

- **Network participants** — people Ditto knows but who haven't adopted the product. They experience Ditto as a useful connector, not as software. They may never become workspace users and that's fine.
- **Active users without workspaces** — people using Ditto for sales or connections via email/voice/SMS but who haven't needed the full product.

**Personas doc update needed:** The existing four personas should be marked as "Layer 3 — Workspace Users." A note should be added acknowledging the Layer 1 and Layer 2 audiences. Full persona development for these layers can follow once real network participant data exists. Flagged for the Architect.

---

## Design Insights Captured

Five insights emerged during this design work:

1. **Insight-147: Recipient experience is the growth engine** — Every recipient interaction is simultaneously outreach AND marketing for Ditto. The quality of what recipients experience determines whether the network grows. Design both sides or fail.

2. **Insight-148: Voice briefings are the relationship anchor** — The daily/weekly voice check-in is where the user-Ditto relationship compounds. It's the moment Ditto feels most like a real teammate. This interaction must be exceptionally well-designed.

3. **Insight-149: Trust tiers apply to Ditto's own reputation** — Ditto's reputation with each recipient follows the same progressive trust pattern as process trust tiers. First outreach is "supervised" (recipient evaluates carefully). After 2-3 good touchpoints, recipient is "spot-checked" (opens Ditto's emails by default). After consistent quality, recipient is "autonomous" (actively wants to hear from Ditto).

4. **Insight-150: Selling vs Connecting — Different Posture, Not Different Power** — Both modes are user-initiated through Self. Both work through existing architecture. The difference is Ditto's posture: internal sales person (Selling) vs researcher/advisor (Connecting). Not who has authority — how Ditto carries it.

5. **Insight-151: The Network Is the Front Door** — The Ditto journey doesn't start with "install Ditto." It starts with a conversation. Three-layer journey: network participant → active user → workspace user. Autonomous network activity is the foundation and top of the funnel, not a future feature.

---

## Data Model Implications (For Architect)

The Network Agent depends on **person-scoped memory** — a record for every person in Ditto's network, whether they're a user or not. The Architect must design this. Key fields/relationships:

- **Identity:** Name, contact details (email, phone, social), organization, role
- **Relationship type:** Network participant / active user / workspace user (the three journey layers)
- **Interaction history:** Every touchpoint — sent, received, meetings, introductions, outcomes
- **Trust level (Ditto → person):** Insight-149 — progressive trust Ditto has earned with this person (cold → familiar → trusted)
- **Mode context:** Are they a recipient of Selling outreach? A connection candidate? Both? Neither (just a participant)?
- **Persona association:** Which persona (Alex/Mira) has interacted with them? Must be consistent.
- **Cross-user isolation boundary:** If Ditto represents User A and User B to the same person, interaction context from A must never leak into B's interactions. The character bible flags this (multi-user persona boundary). This is a **security constraint**, not just a design preference.
- **Match quality signals:** What predicts good connections for this person? Learned from introduction outcomes.
- **Dormancy:** Last interaction date, re-engagement triggers (new public activity, a user's need matches their profile), maximum re-engagement cadence.

---

## Security Constraints

1. **Cross-user data isolation is mandatory.** When Ditto operates for multiple users via the same persona, recipient context from one user's interactions must never leak into another's. Alex talking to Priya on behalf of User A is a completely separate context from Alex talking to Priya on behalf of User B. The shared person graph (Insight-146) aggregates match quality signals, not conversation content.

2. **Email authentication.** SPF/DKIM/DMARC on all sending domains. Non-negotiable in 2026. See channel design section.

3. **Consent and opt-out.** Every outreach email must include an easy opt-out. Ditto must respect it permanently. "Refusal as loyalty" (Insight-145) — respecting boundaries builds Ditto's reputation.

---

## Reference Docs

- **Consulted:** `docs/personas.md`, `docs/human-layer.md`, `docs/architecture.md` (trust tiers, process primitive, agent model), `docs/research/onboarding-intake-coaching-patterns.md`, `docs/research/ai-sdr-and-network-introduction-platforms.md`, `docs/ditto-character.md`
- **Created:** `docs/ditto-character.md` (character bible), `docs/insights/147-*` through `docs/insights/151-*`
- **Updated:** `docs/landscape.md` (AI SDR section), `docs/research/README.md`
- **Personas check:** Drift found — existing personas describe Layer 3 (workspace users) only. Layer 1 (network participants) and Layer 2 (active users without workspaces) are a broader audience not yet covered. Flagged for Architect in persona impact section above.
