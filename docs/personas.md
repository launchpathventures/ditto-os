# Ditto — User Personas and Problem Framing

**Version:** 0.2.1
**Date:** 2026-03-31
**Status:** Draft — foundational input for Designer and Architect roles
**Scope:** Who we're building for, what their world looks like, and what problems Ditto solves from their perspective

This document captures the *user's* reality — not the system architecture, not the technical design, but the lived experience of the people Ditto exists to serve. Every design and architecture decision should be traceable to a real problem felt by a real person described here.

**Provenance:** These personas are defined by the project creator based on domain knowledge of target markets and user archetypes. They are not yet validated by user research. Treat them as strong hypotheses — good enough to drive design, but update when real user contact provides new data.

---

## The Core User Insight

The people Ditto serves are **not** looking for an "AI platform." They are looking for **relief from the operational work that consumes their days** — the reviewing, checking, reconciling, formatting, chasing, and coordinating that prevents them from doing the strategic work they're actually good at.

They don't think in terms of "agents" or "workflows" or "orchestration." They think: *"I spend 3 hours every Monday reconciling invoices and I know a machine should be doing this."* Or: *"I personally check every quote before it goes to the customer because last time I didn't, we quoted the wrong price."*

Their problem is not "I need AI." Their problem is "I need to stop doing this myself, but I can't hand it off because nothing I've tried is reliable enough."

And when they *do* try AI, they hit the reinvention problem: the same prompt produces different outcomes every time — not because context shifted, but because nothing durable governs how the work gets done. No memory of what worked last time. No process to follow. No standards to meet. They re-check the same things every time. **AI without durable process is unreliable. AI without memory is unlearning.** This is why "just use ChatGPT" doesn't work for operational work — it reinvents its approach randomly instead of following a process that improves.

---

## Two Design Principles That Shape Everything

### 1. One Process Must Be Valuable

Ditto must deliver clear value from a **single process**. The product can't require an organisational chart of processes before the user sees the benefit. One process — invoice reconciliation, quote generation, content review — running reliably with progressive trust should justify the product on its own.

This means:
- Onboarding starts with one process, not a "set up your organisation" wizard
- The Daily Brief, Review Queue, and Trust Control all work for one process — they don't need a portfolio to be meaningful
- Value compounds as more processes are added, but it starts from one
- The emotional journey begins at "this one thing works" — expansion comes from the user's own initiative

### 2. Mobile Must Be Seamless, Not Primary

Most work happens at the desk. Process setup, deep review, complex editing, data analysis — these are desktop activities. But the desk is not the only place decisions happen. These users are regularly away from their desks — on job sites, in client meetings, commuting, at the warehouse — and work doesn't pause because they're not at a screen.

Mobile is a **supporting surface** that must be seamless. The user must be able to continue work, nudge things forward, and perform jobs from their phone without friction — not as a degraded experience, but as a natural extension of the desktop.

This means:
- The morning brief can be scanned on a phone over coffee — or at the desk with full detail
- Simple review decisions (approve, reject) work from mobile; complex edits happen at the desk
- Quick capture (voice, text, photo) happens wherever the user is — on-site, in a meeting, commuting
- Push notifications surface what needs attention — the user decides whether to act now or at the desk
- "Edit @ desk" (Insight-012) bridges mobile triage to desktop action — the user acknowledges on mobile, completes at the desk
- The transition between mobile and desktop must be invisible — same queue, same state, no sync friction

---

## Who We're Building For

### Primary: The Outcome Owner

The outcome owner is the person **responsible for results** — they might have a clear sense of the process, or they might just know what "good" looks like and need a system to help them define, refine, and improve the process over time. They are the domain expert, not the technology expert. They carry the quality standard in their head — and that's exactly why they can't delegate.

**What they have in common:**
- They are responsible for outcomes, not just activities
- They have high standards and have been burned by delegation failures (to people or tools)
- They spend significant time on operational work they know is beneath their capability
- They can describe what "good" looks like but struggle to codify it into rules — some have a clear process, others just have instinct and standards
- They are pragmatic — they'll adopt technology that works, but they won't tolerate configuration hell or unreliable output
- They did not train as managers. Managing agents is a new skill they'll need to learn without realising they're learning it
- **They're regularly away from their desk** — on sites, in meetings, commuting — and need to keep work moving from their phone
- They've tried AI tools and hit the reinvention problem: every interaction starts from scratch, nothing learns, nothing sticks

**What distinguishes them from power users of existing AI tools:**
- They are not prompt engineers. They won't iterate on prompts to get better results.
- They are not workflow designers. They won't draw boxes and arrows to define automation.
- They are not developers. They won't write scripts, configure APIs, or debug integrations.
- They *will* review outputs, make corrections, and say "no, that's wrong." They're editors and approvers by nature — that's the job they already do.

---

## Four Personas

### Persona 1: Rob — Managing Director of a Trades Business

**Role:** Runs a plumbing/electrical/building company. 8-15 staff. Rob is the owner, the senior tradesperson, the sales closer, and the operations manager.

**Context:** His business runs on quotes, job scheduling, invoicing, compliance, and customer follow-up. He has an office manager who handles bookkeeping and a foreman who manages the crew. Everything else flows through Rob. He's on job sites 60% of the day.

**A typical day:**
- 6:30am: Checks phone in the truck on the way to a job. 23 emails, 8 texts from customers, 2 voicemails. Scans for anything urgent while driving (shouldn't be, but does).
- 7:00am–12:00pm: On a job site. Between tasks, he's responding to texts, checking if yesterday's quotes were sent, and mentally tracking which jobs are running behind.
- 12:30pm: In the truck eating lunch. Does 30 minutes of "admin" — approves a supplier invoice, calls back a customer about a quote, texts the foreman about tomorrow's schedule.
- 1:00pm–4:30pm: Second job site. A customer calls about a new bathroom renovation — Rob takes notes on the back of a receipt. Tells them he'll have a quote by end of week. He won't.
- 5:00pm: Back in the truck. Dictates reminders into his phone. Half of them will be lost.
- 6:30pm: At home. After dinner, spends an hour at the kitchen table: writing up the bathroom quote, following up on 2 overdue invoices, updating the job schedule for next week. His partner asks when he's going to stop working.

**What Rob says:**
- *"I can do the work. I just can't run the business AND do the work."*
- *"If I don't personally check the quotes, we'll quote wrong and lose money. But I don't have time to check every quote."*
- *"I need something I can use from my phone. I'm never at a desk."*
- *"The guy who calls back first gets the job. I'm losing work because I can't follow up fast enough."*

**Rob's core problem:** He's the bottleneck for every operational decision in his business, but he spends most of his day on tools (literally) not at a desk. He needs his business operations to keep moving while he's on site — and he needs to make decisions from his phone in the gaps between jobs.

**What Ditto gives Rob (single process start):** Rob starts with one process: quote generation. When a customer enquiry comes in (email, text, voicemail transcription), the quoting process drafts a quote based on Rob's pricing rules and past quotes for similar jobs. Rob gets a push notification: "New quote ready for Acme bathroom reno — $14,200. Tap to review." He opens it on his phone between jobs, scans the line items, adjusts the labour estimate (the system was 2 hours low), approves, and it's sent. 3 minutes instead of 45 minutes at the kitchen table. That one process — just quoting — is enough to justify Ditto.

**Rob's first week (Define + Delegate):** Rob sits down at the kitchen table (the one time he's at a "desk") and describes his quoting process to Ditto: "Customer calls or emails about a job. I work out the materials from the spec, add labour based on the job size, add margin, and send the quote." The system asks: "Where do your material prices come from?" (supplier price list). "How do you estimate labour?" (hours per job type — Rob gives rough rules). "What margin?" (25% residential, 20% commercial). By the end of a 20-minute conversation, the quoting process exists. Rob activates it supervised — every quote comes to him for review on his phone.

**Rob's mobile day (month 2):** Morning brief on his phone over coffee: "3 quotes ready for review. Follow-up process flagged: the Henderson job quote is 4 days old with no response — draft follow-up attached. Yesterday's invoice batch: 5 of 5 sent, 2 marked paid." Rob approves 2 quotes, adjusts one, taps "send follow-up" on Henderson, and he's on the road by 7am. The review queue is empty. On site at 10am, a customer mentions wanting a quote for a hot water replacement. Rob voice-captures: "Henderson also wants HW quote, Rinnai system, access is tight." The capture process classifies it and adds it to the quoting pipeline. Rob doesn't think about it again until the draft quote appears in his review queue tomorrow morning.

**Rob's trust decision:** After 6 weeks, the quoting process has produced 34 quotes. Rob corrected 3 (all labour estimates — the system was consistently low on bathroom jobs). The system learned the bathroom labour pattern after Rob taught it. Now it shows: "Last 15 quotes: 14 approved, 1 corrected (non-bathroom). Suggest upgrade to spot-checked." Rob accepts from his phone — he'll now review a sample instead of every quote. But he keeps the invoicing process at supervised. Different processes, different trust — Rob decides each one.

---

### Persona 2: Lisa — Managing Director of an Ecommerce Business

**Role:** Runs an online retail business. 10-20 staff across warehouse, customer service, and marketing. Lisa handles strategy, product selection, supplier relationships, and oversees everything else.

**Context:** The business runs on inventory management, customer communications, marketing content, supplier negotiations, and order fulfilment. Lisa has a warehouse manager and a customer service lead, but she's the one who decides what to stock, how to price it, and how to market it. She splits time between the warehouse, meetings, and her home office.

**A typical day:**
- 7:00am: Checks Shopify dashboard on her phone. Overnight orders look normal. One negative review catches her eye — a customer got the wrong size. She screenshots it and texts customer service.
- 8:30am: At the warehouse. Meets with the warehouse manager about a delayed shipment from a supplier. Needs to decide: wait or source from the backup supplier at a higher cost?
- 10:00am: Back at her desk. Reviews marketing content for the week — 3 product descriptions, 2 email campaigns, 4 social posts. Rewrites 2 of the product descriptions (too generic, don't highlight the differentiators). Approves the emails with minor tweaks.
- 12:00pm: Supplier call about new product line. Takes notes in a notebook.
- 1:30pm: Tries to work on next quarter's product strategy. Gets pulled into a customer escalation (wrong item shipped again — same SKU problem as last month).
- 3:00pm: Reviews pricing for 15 products — competitor prices changed. Adjusts 4. Should have been done 3 days ago.
- 5:00pm: Finally starts on the product strategy deck. Gets 3 slides in before giving up for the day.

**What Lisa says:**
- *"I hire good people, but I'm still the only one who knows what 'good' looks like for our brand."*
- *"The marketing content is fine but it's not us. I keep fixing the same things — make it less generic, highlight what's different, match our voice."*
- *"I need to know what's going wrong before the customer tells me. Right now I find out from reviews and complaint emails."*
- *"Everything is reactive. I want to be strategic but I spend all day putting out fires."*

**Lisa's core problem:** She can't get ahead of her business because she's constantly reacting — to quality issues, content that doesn't match the brand, pricing that's drifted, customer problems that should have been caught earlier. She needs processes that handle the routine and surface exceptions before they become customer-facing problems.

**What Ditto gives Lisa (single process start):** Lisa starts with product description generation. When a new product is added to the catalogue, the content process drafts a description using Lisa's brand voice, the product's key differentiators, and competitor positioning data. Lisa reviews on her phone between meetings — approves most, edits the ones that don't capture the differentiator. After 3 weeks, the "Teach this" pattern kicks in: "You consistently add the material source country and the sustainability angle. Teach this?" Lisa taps yes. That one process frees up 4 hours a week of content editing.

**Lisa's expansion (month 2):** The content process is running at spot-checked trust — Lisa reviews 1 in 5 descriptions. She adds a competitor price monitoring process: daily scan of 3 competitor sites, flag any product where the price gap exceeds 15%. Her morning brief now covers both: "2 descriptions ready for review. 3 products flagged for pricing — competitor X dropped their widget price by 20% yesterday." Lisa handles both from her phone on the commute in. The product strategy deck? She finally has time for it.

---

### Persona 3: Jordan — Generalist Technologist in a Mid-Size Organisation

**Role:** Could be IT manager, operations analyst, "digital transformation" lead, or simply "the person who's good with technology." In a 50-200 person company. Not a developer, but tech-savvy enough to see opportunities.

**Context:** Jordan sees problems across the organisation that could be solved with better systems. They're the person colleagues come to with "can we automate this?" or "is there a tool for that?" Jordan has influence but not authority — they can propose solutions but need buy-in from department heads. They're looking for leverage: how to make a 50-person company operate like a 70-person company without hiring 20 people.

**A typical week:**
- Monday: HR asks if there's a way to automate reference checking. Jordan spends an hour researching tools, finds 3, none of them do exactly what's needed.
- Tuesday: Finance complains about month-end reconciliation taking 3 people 2 days. Jordan knows this should be automatable but doesn't have the bandwidth to set it up.
- Wednesday: A department head asks Jordan to "make the AI do" their weekly report. Jordan tries to set up a ChatGPT workflow, gets it 60% right, gives up because the customisation would take longer than writing the report.
- Thursday: IT tickets. Jordan's real job. No time for the 5 "could we automate X?" requests sitting in their inbox.
- Friday: Jordan presents a proposal to leadership: "Here are 8 processes we could automate, roughly prioritised." Leadership says "great, let's start with #1." Jordan now has to figure out how to deliver it alongside their actual job.

**What Jordan says:**
- *"I can see 20 things that should be automated. I just can't build 20 solutions."*
- *"The tools out there solve one problem each. I need something that works across departments."*
- *"I need to show results fast. If I can't demo value in 2 weeks, I lose sponsorship."*
- *"I'm not a developer. I can configure things and I understand systems, but I'm not writing code."*

**Jordan's core problem:** They have the vision but not the capacity. They can see the operational leverage AI could provide across their organisation, but every solution requires either custom development or stitching together 5 tools. They need a platform that lets them stand up processes quickly, prove value, and expand — becoming the person who unlocked organisational leverage, not the person who maintains 15 different automations.

**What Ditto gives Jordan (single process start):** Jordan starts with the HR reference checking process that was requested on Monday. They describe it to Ditto: "We get a candidate name and 3 referees. We need to email each referee a standard questionnaire, collate the responses, flag any concerns, and produce a summary for the hiring manager." The process is live by Tuesday. The HR lead gets their first automated reference check summary in the review queue Wednesday morning. Jordan has delivered visible value in 48 hours — and the platform that made it possible can do the same for the other 7 items on their list.

**Jordan's leverage moment (month 2):** Jordan now has 4 processes running across 3 departments. The finance reconciliation process saved 2 person-days per month. The HR reference process cut turnaround from 5 days to 1. Jordan's morning brief — which they check on their phone during the commute — shows process health across all departments. In the leadership meeting, Jordan shows the Process Graph on the big screen: "Here's what we've automated, here's the time saved, here's what's next." The conversation shifts from "should we do this?" to "what's next on the list?"

**Jordan's mode split:** Jordan is the one persona whose primary mode is desk-based. Process setup (Define), cross-department demos, and Process Graph analysis all happen at a desk. Mobile is secondary for Jordan — morning brief on the commute, status checks between meetings. This persona validates that Define mode can remain desk-first while Operate mode is mobile-first.

---

### Persona 4: Nadia — Team Manager Supporting Specialists with Agents

**Role:** Manages a team of 5-10 specialists (could be analysts, designers, consultants, case workers, account managers). Her job is to ensure quality, allocate work, and keep the team productive.

**Context:** Nadia's team does knowledge work that requires judgment — it can't be fully automated. But each team member has operational overhead: report formatting, data gathering, follow-up emails, compliance checks, status updates. Nadia wants to give each team member an agent-supported process that handles their operational burden, while she maintains quality oversight across the team.

**A typical day:**
- 8:00am: Team standup. 3 people are behind on deliverables. 2 are waiting for data from another department. Everyone spent yesterday afternoon on admin instead of client work.
- 9:00am: Reviews an analyst's report. Good analysis, but the formatting is wrong (again), the executive summary is too long, and two data sources aren't cited. Nadia makes the corrections and sends it back. 40 minutes for a 10-minute review.
- 10:30am: A team member asks Nadia to approve a client communication. It's fine. Another asks about the template for quarterly reviews. Nadia answers the same question she answered last quarter.
- 12:00pm: Reviews two more deliverables. One is excellent. One has a recurring error — the analyst keeps using last quarter's baseline numbers. Nadia corrects it and makes a mental note to mention it in the next 1:1.
- 2:00pm: Client meeting. Nadia needs to know the status of 4 active projects across her team. Spends 20 minutes before the meeting Slacking each team member for updates.
- 4:00pm: Tries to work on team development plans. Gets interrupted by another approval request.

**What Nadia says:**
- *"My team is brilliant at the work. They're drowning in the overhead around the work."*
- *"I spend half my day reviewing things I've already told people how to do. Same corrections, different week."*
- *"I need to see what's happening across my team without asking everyone individually."*
- *"If each of my analysts had an agent handling their formatting, data gathering, and follow-ups, I could focus on coaching and client relationships."*

**Nadia's core problem:** She's managing quality across multiple people's operational processes. Each team member has the same pattern: good at the core work, drowning in the surrounding admin. Nadia corrects the same formatting and compliance issues repeatedly. She needs her team's operational processes to be agent-supported — with her as the quality governor across all of them.

**What Ditto gives Nadia (single process start):** Nadia starts with one process: report formatting and compliance checking. When an analyst finishes their draft, the formatting process applies the standard template, checks citations, verifies data sources, and flags the recurring baseline-numbers error. The analyst gets a pre-formatted draft with issues highlighted. Nadia's review queue shows only the reports that need her judgment — not the ones that just needed formatting. One process, applied across her whole team, cuts her review time by 60%.

**Nadia's team view (month 2):** Nadia's morning brief — checked on her phone before standup — shows: "Team output: 6 reports delivered, 4 approved clean, 2 corrected (both formatting issues now taught). Team health: all processes green except Chen's data gathering process (3 failures this week — data source API changed)." In the standup, Nadia already knows who's behind and why. The 20-minute Slack scramble before client meetings is gone. She opens the Process Graph on her laptop: her team's processes are interconnected — analyst output feeds the client reporting process, which feeds the quarterly review process. She can see the system, not just the tasks.

**Nadia's delegation cascade:** Nadia doesn't just manage her own trust decisions — she governs trust across her team's processes. When an analyst's formatting process reaches 95% clean rate, the system suggests upgrading to spot-checked. Nadia reviews the data and accepts — but only for that analyst's process. Another analyst's process stays supervised because their correction rate is still high. Trust is per-process, per-team-member, and Nadia controls it.

---

## The Problems We're Solving (User's Perspective)

### Problem 1: "I can't delegate because nothing is reliable enough"

**The feeling:** Anxiety. Every time they've tried to delegate (to a person, a tool, or an AI), something went wrong — silently. They discovered the problem too late. Now they do it themselves.

**Why existing tools fail:** Binary trust. Either the tool does it autonomously (and things go wrong silently) or the human checks everything (and there's no point using the tool).

**What Ditto does differently:** Progressive trust. Everything starts supervised — the human reviews every output. As the system proves reliable, it earns less oversight. But the human never "turns off" monitoring — the system downgrades itself if quality drops. The human's anxiety is addressed by visible trust data: "47 runs, 83% clean, corrections decreasing."

### Problem 2: "AI reinvents its approach every time — nothing learns, nothing sticks"

**The feeling:** Frustration. They've told the AI tool 12 times to stop using last quarter's baseline. They've corrected the formatting on the luxury brand report 8 times. Every time feels like the first time. The AI doesn't have a process to follow — it figures it out from scratch each time.

**Why existing tools fail:** No durable process. No memory. Each invocation is a blank slate. Some tools have "custom instructions" but they're generic — they don't learn from the specific corrections the user makes on specific types of work. There's no accumulating standard that improves over time.

**What Ditto does differently:** Processes are durable — defined once, refined through use, executed consistently. The AI doesn't reinvent its approach; it follows a governed process that improves. Edits ARE feedback. When the user corrects an output, the system captures the diff, detects patterns across corrections, and offers to make them permanent: "You consistently fix the baseline year in Chen's reports. Teach this?" One tap, and the correction becomes a quality criterion the harness enforces. The process gets better every time — the opposite of reinvention.

### Problem 3: "I can't see what's happening across all my work"

**The feeling:** Overwhelm. They have 6 inboxes, 4 dashboards, 3 project tools, and a spreadsheet. There's no single view of "what needs my attention right now?"

**Why existing tools fail:** Each tool shows its own activity. There's no cross-tool awareness. The human is the integration layer — they hold the full picture in their head.

**What Ditto does differently:** One morning brief, one review queue — on the phone. Everything that needs human attention flows through the same interface: a quote to approve, a report to review, a pricing alert, a process improvement suggestion. The Daily Brief explains priorities and reasoning. The human makes decisions in one place, from wherever they are.

### Problem 4: "Setting up automation is harder than just doing the work"

**The feeling:** Resignation. They've tried. Zapier, Make, custom scripts, AI assistants. Each requires learning a new paradigm, drawing workflow diagrams, or configuring triggers and actions. By the time it's set up, they could have done the work 10 times.

**Why existing tools fail:** They require the user to think like a programmer — define inputs, map logic, handle edge cases upfront. Non-technical users don't think this way. They think in outcomes: "I need quotes out the door within 24 hours."

**What Ditto does differently:** Conversation-first setup. The user describes their pain: "Customer calls about a job, I have to work out materials and labour and send a quote." The system recognises the pattern, asks one question at a time, and builds the process definition alongside the conversation. The user corrects and confirms. They never draw a workflow diagram or configure a trigger. By the time the conversation ends, the process exists — and the very first output appears in their review queue.

### Problem 5: "I don't trust AI because I can't see its reasoning"

**The feeling:** Suspicion. The AI gave an answer, but how did it get there? What data did it use? Is it making things up? The user has been burned by hallucination or confident-sounding wrong answers.

**Why existing tools fail:** Black boxes. The AI produces output, but there's no audit trail, no confidence scores, no source citations, no record of what was checked.

**What Ditto does differently:** Visible harness. Every output shows what was checked (pricing check: passed, margin check: 1 warning). Confidence scores per item. Evidence trails with source links. The user reviews the harness's review — not raw output. They learn to calibrate: "85% confidence from this agent usually means one minor issue."

### Problem 6: "Work piles up because I can't act on it away from my desk"

**The feeling:** Guilt and delay. They know things are waiting for their approval. They know a customer is waiting for a quote. But they're on a job site, in a meeting, on the road. Simple decisions that would take 30 seconds at a desk pile up because they can't get to them. By the time they're back at the desk, they're dealing with a backlog instead of making progress.

**Why existing tools fail:** Desktop-only design. Most business tools assume you're at a computer. Mobile is an afterthought — a shrunken desktop that's painful to use. The tools that are mobile-native (messaging, email) aren't structured enough for process decisions.

**What Ditto does differently:** Seamless mobile support. The desk is where most work happens — setup, complex editing, deep review, analysis. But simple decisions flow to the phone naturally: approve a quote, triage a report, capture a note. Push notifications surface what needs attention. "Edit @ desk" lets the user acknowledge an issue on mobile and complete the edit when they're back at a screen. The same queue, same state, no sync friction — the phone extends the desk rather than replacing it.

---

## Jobs to Be Done (User Motivation)

These are framed from what the user is *trying to accomplish*, not what the system does. Each motivational job maps to one or more of the six human interaction jobs defined in `human-layer.md` (Orient, Review, Define, Delegate, Capture, Decide) — this mapping tells the Designer which UI surfaces and ContentBlocks serve each motivation.

| Motivational job | User says | Emotional state | Interaction jobs served | Key surfaces |
|-----------------|-----------|-----------------|------------------------|-------------|
| **Stop doing work I've outgrown** | "I want to spend my time on strategy, not operations" | Frustrated by repetitive work | Review (approve/edit outputs), Orient (see what's done) | Inline ReviewCardBlock, Today composition briefing |
| **Trust without blind faith** | "I want to delegate but see what's happening" | Anxious about quality | Delegate (adjust trust), Orient (visible trust data) | Trust control slider (process detail), StatusCardBlock with health, MetricBlock sparklines |
| **Teach once, not repeatedly** | "When I correct something, it should stay corrected" | Annoyed by repetition | Review (edits as feedback), Decide (confirm patterns) | Implicit feedback capture, SuggestionBlock for pattern confirmation |
| **See the full picture** | "I need one place that shows me what matters" | Overwhelmed by fragmentation | Orient (status across processes), Decide (cross-process awareness) | Today composition (briefing narrative + process health), sidebar process list |
| **Set things up without a CS degree** | "I'll describe what I need — you figure out the how" | Resigned from past tool failures | Define (describe process), Delegate (assign trust level) | Conversation with Self, ProcessProposalBlock, Process Builder panel |
| **Know it's working when I'm not looking** | "I need to sleep at night knowing nothing went wrong" | Worried about silent failures | Orient (monitoring), Decide (act on degradation) | Briefing narrative (overnight summary), ProgressBlock, AlertBlock for degradation |
| **Keep work moving when I'm away from my desk** | "I shouldn't have to wait until I'm at a computer to approve a quote" | Guilty about delays, frustrated by work piling up | Review (mobile approve/reject), Orient (mobile brief), Capture (text on-the-go) | Mobile conversation (full width), bottom sheet artifact review, prompt input capture |
| **Put something live for my users/customers** | "I need a page where my customers/team can submit / see / book — without hiring a developer or learning a website builder" | Frustrated that "doing something for my users" still requires IT knowledge | Define (describe the thing), Delegate (trust it to serve users without daily review), Decide (iterate from feedback) | Conversation with Self, inline preview (mobile + desktop frames), new "Apps" sidebar surface, StatusCardBlock (usage + health), SuggestionBlock (teach-iterations + rollback). Fulfilled by a lightweight framework designed and maintained by Ditto — Jordan's primary expression; Rob (customer-intake) and Nadia (team dashboard) have latent variants. |

---

## Anti-Personas: Who We're NOT Building For

### The Prompt Engineer
Someone who enjoys iterating on prompts, fine-tuning AI behaviour, and optimising model parameters. They want control over the AI itself. Ditto is the wrong tool — they want direct model access.

### The Workflow Designer
Someone who thinks in boxes and arrows, enjoys visual programming tools, and wants to design complex conditional logic. They'd be better served by n8n, Retool, or custom code.

### The Philosophical AI Sceptic
Someone who fundamentally doesn't believe AI can do knowledge work — period. Not "I've been burned" (that's Rob — our ideal user) but "machines can't do this and never will." Experiential sceptics who've been burned by bad tools are actually our best early adopters — their high standards generate the feedback data that makes the harness better.

### The "Just Automate Everything" Person
Someone who wants to remove humans from the loop entirely. Ditto's core principle is that humans stay in control. If they want full automation, they want a different product.

---

## The Emotional Journey

The product experience follows a specific emotional arc. **Crucially, this journey starts with a single process — it must feel complete and valuable at that scale.**

**Week 1 — Cautious Hope:** "Let's see if this is different." The user sets up one process through conversation (at a desk). They review every output on their phone. They're testing the system — and the system knows it (supervised tier). The single process is already saving time: Rob's quoting, Lisa's product descriptions, Jordan's reference checks, Nadia's report formatting.

**Week 2-3 — Building Confidence:** "It's getting things right." Corrections are decreasing. The user starts to recognise the harness is catching real issues. They "Teach this" on their first pattern. They feel heard — the system learned from their correction. The morning brief feels natural — a quick phone check over coffee that replaces 30 minutes of inbox scanning.

**Month 1 — Trust Forming:** "I don't need to check everything." The system suggests upgrading the process to spot-checked. The user sees the evidence: 90% clean rate over 30 runs. They accept. They spend a few minutes reviewing exceptions instead of hours doing the whole job. The single process has proven itself.

**Month 2 — Expansion:** "What else can this handle?" The user sets up a second process. Then a third. The morning brief shows all their processes in one place. They start to see their work as a system, not a set of disconnected tasks. Jordan shows the Process Graph in a leadership meeting. Rob's partner notices he's home earlier.

**Month 3+ — The Compound Effect:** "I've got my time back." Most processes run autonomously with exception-only review. The user's mornings shift from doing operational work to making strategic decisions. When something degrades, the system catches it and proposes fixes with evidence. The user manages exceptions, not operations.

**This emotional journey is the product.** Every design decision should accelerate or protect it. A clunky review experience at Week 1 kills the journey. A process that requires 3 processes before it's useful kills the journey. Work that piles up because the user can't act on it away from their desk kills the journey. A missed degradation at Month 2 destroys trust permanently.

---

## How to Use This Document

**For the Designer:** These personas and problems are your primary lens. The interface is **conversation-first** — the user talks to the Conversational Self, and structured content (ContentBlocks) renders inline in the conversation and in composition intents (Today, Inbox, Work). When designing any interaction, ask: "Would Rob use this on his phone between jobs? Would Lisa understand this at a glance? Would Jordan be able to demo this to leadership in 2 weeks? Would Nadia see her team's health at a glance?" If the answer is no, the design needs work. **Desktop is primary, mobile must be seamless** — most work happens at a desk, but simple decisions, captures, and status checks must flow naturally to the phone. See `human-layer.md` for the workspace architecture, ContentBlock vocabulary, and AI Elements component library.

**For the Architect:** The problems and jobs-to-be-done constrain what the system must deliver. When making trade-offs, these are the stakes — not technical elegance, but whether Rob can approve a quote from a job site, whether Lisa can stop rewriting product descriptions, whether Jordan can prove value in 48 hours, whether Nadia can govern quality across her team. **Single-process value is a hard constraint** — every feature must work for one process, not just for many. **Seamless mobile is a constraint** — desktop/mobile transition must be invisible. **Architecture + UX briefs must be paired** (Insight-119) — invisible infrastructure doesn't serve users.

**For the PM:** The emotional journey is the roadmap's north star. Each phase should move users further along the journey. If a phase doesn't advance the emotional arc, question whether it's the right next thing to build.
