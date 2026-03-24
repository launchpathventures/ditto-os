# Research Report: Onboarding, Intake, and User Coaching Patterns

**Date:** 2026-03-24
**Role:** Dev Researcher
**Research question:** What is the gold standard for onboarding, intake, and user coaching in AI-native products and adjacent domains? What can Ditto build FROM?
**Triggered by:** Insight-093 (Onboarding Is Deep Intake, Not Setup) — onboarding identified as critically under-designed in Phase 10 briefs
**Consumers:** Dev Architect (Brief 040 onboarding/user model), Dev Designer (interaction spec), Dev Builder (implementation)

---

## Context

Insight-093 identified that Ditto's onboarding was treated as thin user model extraction ("business type, size, pain points") when it should be a white-glove multi-session intake across 9 dimensions. Three prior insights (079, 080, 081) already contain deep design thinking about the onboarding surface — this research complements them with external patterns.

### Prior Internal Design (read these first)

- **Insight-079** (Conversation is intake, process is the product): Three-phase progression — Gathering → Proposing → Working through it. The key transition: Self proposes a process-proposal-card when it has enough context. Chat is the input method, not the destination.
- **Insight-080** (Artefact-primary surfaces): The thing being built is the primary surface, not conversation. During onboarding, the artefact is the user model taking shape — a visual map that fills in as conversation progresses.
- **Insight-081** (Guided Canvas): The "battleships model" — behind every Self-initiated process is an information model (a grid of what needs to be known). The user should SEE the grid, not just answer questions. Structured inputs (selectors, sliders, tag pickers) are the default; free text is the fallback.
- **Insight-074** (Self as Guide): Cold start is a relationship, not a wizard. Guidance is ongoing, not just initial.
- **`docs/research/self-meta-processes-ux.md`** section 1: Onboarding as a Self-initiated process with knowledge synthesis cards.

### Research Questions

1. How do best-in-class products onboard non-technical users into AI-powered tools?
2. How do professional services firms do deep intake conversationally?
3. How do products gather deep user information progressively without fatigue?
4. Are there products that actively coach users to be better at working with AI?
5. What patterns exist for white-glove digital onboarding at scale?
6. What frameworks exist for needs discovery through conversation?

---

## 1. AI Product Onboarding Patterns

### 1.1 The Current Landscape (2025-2026)

The AI product onboarding landscape has shifted dramatically. Per [UserGuiding's 2025 survey of top AI tools](https://userguiding.com/blog/how-top-ai-tools-onboard-new-users), only ~40% still use traditional tooltips/checklists/tutorials. Most now focus on embedded experiences: empty states with CTAs, example prompts, and interfaces that teach themselves through use.

**Key stat:** Reducing form fields from 11 to 4 increases conversions by 120% ([HubSpot progressive profiling study](https://blog.hubspot.com/blog/tabid/6307/bid/34155/how-to-capture-more-and-better-lead-intel-with-progressive-profiling.aspx)).

**Dominant patterns:**

| Pattern | Products | How it works |
|---------|----------|-------------|
| **Example prompts** | Perplexity, ChatGPT, Claude | New users see suggested prompts → immediate value without reading guides |
| **Conversational onboarding** | Intercom Fin, Twin AI | User describes what they want, AI structures the setup |
| **Synthetic sandbox** | Superhuman, Cursor | Practice in a safe environment before real work |
| **Quick classification** | Most AI tools | 3-5 questions at signup to personalise the experience |
| **Value-first** | Notion AI, Jasper | Show AI doing something useful in <60 seconds |

**What's missing from all of them:** None build a deep, evolving understanding of the user's business, goals, and working style. They onboard to the *tool*, not to the *relationship*.

### 1.2 Twin AI — Vague Idea → Working Agent in Minutes

**Source:** [Twin](https://twin.so/), [Twin docs](https://docs.twin.so/welcome)

Twin allows non-technical users to get an agent running in under a minute. Users describe what they want to accomplish, and Twin helps brainstorm, refine, and turn vague ideas into working agents. 100,000+ agents deployed in first month of public beta.

**Pattern:** Describe → Brainstorm → Refine → Deploy. No upfront planning required.

**What Ditto can learn:** The speed-to-value is impressive, but Twin builds agents, not relationships. There's no deep intake of the user's business context. Ditto's advantage is that the Self understands the whole business, not just one task.

### 1.3 Intercom Fin — Setup in Under an Hour

**Source:** [Fin AI](https://fin.ai/), [Intercom Help](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained)

Fin's setup process: train on your existing knowledge base → run simulated conversations → deploy live → analyze performance. 67% resolution rate, 40M+ conversations resolved.

**Pattern:** Knowledge-first setup (feed the system your existing content) → simulation before deployment → gradual rollout.

**What Ditto can learn:** The simulation/preview step (see how it will behave before going live) maps to Ditto's supervised trust tier. The knowledge-first approach (feed what you already have) is relevant — Ditto's onboarding should ingest existing documents, not just ask questions.

### 1.4 ChatGPT / Claude — Memory Systems

**Source:** OpenAI Memory, Claude Projects, prior research at `docs/research/persistent-conversational-identity.md`

ChatGPT saves explicit key-value memories from conversation. Claude uses auto-memory (system decides what to remember). Both are passive — they remember what comes up, they don't actively seek understanding.

**Pattern:** Implicit profiling — learn from what the user naturally shares, don't interrogate.

**What Ditto can learn:** The passive approach is insufficient for Ditto. Rob won't naturally mention his margin structure or labour estimation method — the Self needs to actively ask. But the "selectivity heuristic" (deciding what's worth remembering) is relevant for ongoing deepening.

---

## 2. Professional Services Intake Patterns

### 2.1 Consulting Discovery Frameworks

**Source:** [Discovery Call Framework 2026](https://www.autointerviewai.com/blog/discovery-call-framework-questions-structure-2026), [Consultative Discovery](https://www.thevisibleauthority.com/blog/every-consulting-firm-needs-a-discovery-service)

Modern discovery frameworks integrate BANT (qualification), MEDDIC (enterprise process mapping) and SPIN (consultative questioning). Structure: 10-15 open-ended questions, interviewer talks <40% of the time.

**Five categories:** Situation → Problem → Impact → Decision → Budget.

**Pattern:** The consultant has a structured mental model of what they need to know, but the conversation feels natural. They don't read from a script — they probe based on what emerges.

**Ditto parallel:** This is exactly Insight-081's "battleships model." The Self has an information model (the grid), but the conversation feels like a natural getting-to-know-you. The Self probes the most important gaps, adapting to what the user shares.

### 2.2 Legal Intake Automation

**Source:** [MyCase automated intake](https://www.mycase.com/blog/ai/automated-legal-intake/), [Voiceflow law firm AI](https://www.voiceflow.com/blog/law-firm-ai), [Clio intake](https://www.clio.com/blog/3-ways-automate-client-intake/)

Legal intake systems use conversational AI with dynamic forms that adjust based on case type and client responses. They perform real-time screening, conflict checking, and case value assessment. Key stat: saves 32.5 working days per attorney annually.

**Pattern:** Hybrid — conversational AI asks questions, but structured forms capture the answers. Dynamic adaptation: if the user mentions a car accident, the form shifts to personal injury questions. CRM integration automatic.

**Ditto parallel:** The dynamic adaptation pattern is directly relevant. When Rob says "plumbing company," the Self should shift to trades-specific questions (materials sourcing, labour estimation, quoting tools) rather than generic business questions.

### 2.3 Every Consulting Firm Needs a Discovery Service

**Source:** [The Visible Authority](https://www.thevisibleauthority.com/blog/every-consulting-firm-needs-a-discovery-service)

The argument: every consulting engagement should start with a structured discovery phase that produces a diagnostic report. This discovery is itself a paid service — it delivers standalone value (understanding of the problem) even if the client doesn't proceed.

**Pattern:** Discovery as a deliverable, not just a precursor. The output of intake IS valuable — a structured understanding of the user's situation that they can see and verify.

**Ditto parallel:** This validates Insight-080's artefact-primary approach. The onboarding process should produce a visible deliverable — "here's what I know about your business" — that the user can verify, correct, and build on. The knowledge synthesis card from the self-meta-processes research is this deliverable.

---

## 3. Progressive Profiling Patterns

### 3.1 Multi-Session Progressive Data Gathering

**Source:** [Typeform progressive profiling](https://www.typeform.com/blog/progressive-profiling-collect-better-data), [HubSpot progressive profiling](https://blog.hubspot.com/blog/tabid/6307/bid/34155/how-to-capture-more-and-better-lead-intel-with-progressive-profiling.aspx), [Descope](https://www.descope.com/learn/post/progressive-profiling), [Croct](https://blog.croct.com/post/progressive-profiling)

Progressive profiling collects data gradually across multiple interactions instead of all at once. It starts with minimal information during initial interaction and requests additional pieces as the user engages more. Key: never ask for the same details twice.

**Core principles:**
1. **Minimal first interaction** — ask only what's needed for immediate value
2. **Value exchange** — every question has a visible payoff ("tell me your margin so I can price the quote correctly")
3. **Never re-ask** — system remembers everything already shared
4. **Conversational framing** — "users don't feel like they're filling out a profile; they feel like they're having a helpful conversation"
5. **Trust-based disclosure** — users share more as they see the system deliver value

**Key stat:** Reducing initial fields from 11 to 4 increases completion by 120%.

**Ditto parallel:** The "value exchange" principle is critical. Rob won't tell Ditto his margin structure just because Ditto asks — he'll tell it when Ditto says "I need your margins to price the Henderson quote correctly." Every information request should have a visible, immediate reason.

### 3.2 Adaptive Difficulty (Duolingo Pattern)

**Source:** [Duolingo gamification](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo), [Duolingo UX analysis](https://goodux.appcues.com/blog/duolingo-user-onboarding)

Duolingo asks simple questions at the outset to personalise: why are you learning? what level? how much time per day? Then it adapts difficulty based on performance — always in the "zone of proximal development" (neither too easy nor too frustrating).

**Pattern:** Classify → personalise → adapt. The initial questions are about *goals and preferences*, not about the user's existing knowledge. Knowledge is assessed through doing, not asking.

**Ditto parallel:** This suggests a split: initial onboarding captures *goals and preferences* (Insight-093 dimensions 1-3), while *depth and quality standards* could be better assessed through actual work rather than self-reporting. The Architect should determine the balance between asking and discovering.

---

## 4. AI Coaching / Teaching Users to Work with AI

### 4.1 The Prompt Coach Pattern

**Source:** [Wise Design Medium article on Prompt Coach](https://medium.com/transferwise-design/from-playtime-to-practice-designing-ai-with-the-prompt-coach-71e6ac672ac2)

Wise (TransferWise) designed a "Prompt Coach" as an AI Gem: it receives a draft prompt, assesses it against a "good prompt" framework, shares feedback, and guides users to improve iteratively. Rather than rewriting, it *educates* — encouraging exploration of techniques and challenging users to apply creativity.

**Pattern:** Receive → assess → coach → iterate. The system doesn't just fix the output — it teaches the user why their input produced that output and how to make it better.

**Ditto parallel:** When Rob gives vague feedback ("fix the quote"), the Self shouldn't just fix it — it should gently coach: "When you tell me *what* to fix, I can get it right the first time. Was it the labour estimate, the pricing, or something else?" This is AI coaching embedded in the workflow, not a separate training mode.

### 4.2 AI Literacy as Context Engineering

**Source:** [Mindvalley AI Mastery](https://www.mindvalley.com/mastery/ai)

The emerging concept of "Context Engineering" — the skill that separates people who get generic AI responses from those who get precise ones. Training focuses on: defining what you want AI to do, providing the right context, and building custom assistants.

**Pattern:** The best AI users aren't better at "prompting" — they're better at providing context. Teaching context-provision is more valuable than teaching prompt syntax.

**Ditto parallel:** Ditto's Self should actively help users become better at providing context. Not "learn to write better prompts" but "here's what helps me do better work for you." Examples: "when you forward me a customer email, I can use the details to draft a more accurate quote" or "the more you tell me about why you changed something, the fewer times I'll make that mistake."

### 4.3 Gap: No Product Does This Well

**Finding:** No surveyed AI product actively coaches users to be better collaborators on an ongoing basis. ChatGPT has a "how to write better prompts" help article. Claude has system prompts documentation. Duolingo coaches language learning. But nobody coaches *AI collaboration* as an embedded, ongoing experience.

**This is original territory for Ditto.** The closest pattern is Duolingo's adaptive coaching — but applied to AI collaboration rather than language learning. A Ditto equivalent could involve recognizing vague input and guiding toward more useful feedback, then acknowledging when the user provides rich context. The Architect and Designer should determine the specific interaction patterns.

---

## 5. White-Glove Digital Onboarding

### 5.1 Superhuman — The Gold Standard

**Source:** [First Round Review](https://review.firstround.com/superhuman-onboarding-playbook/), [Growth Design case study](https://growth.design/case-studies/superhuman-user-onboarding), [Waitlister analysis](https://waitlister.me/growth-hub/case-studies/superhuman)

Superhuman's onboarding: a 30-minute 1:1 video call with an "Onboarding Specialist" (a workflow coach who lives and breathes email productivity). The specialist guides the user through their own inbox, teaching shortcuts and workflows. Results: 65% full migrations happen live, doubled activation/referral rates, $650K+ ARR per specialist/year.

**Key innovations:**
1. **Coaching, not training** — the specialist asks about the user's workflow and adapts the session
2. **User's own data** — they work in the user's actual inbox, not a demo
3. **Shortcuts taught in context** — "press J to go to the next email" while looking at a real email
4. **Synthetic sandbox** — later added a practice environment with fake emails
5. **Value proven in session** — user reaches inbox zero during the onboarding call

**Ditto parallel:** Superhuman proves that high-touch onboarding drives massive activation. Ditto's Self IS the onboarding specialist — but digital, always available, and getting better over time. The key pattern: work with the user's real data from minute one (Rob's actual Henderson quote), not a demo.

### 5.2 Dock — Structured Onboarding Workspaces

**Source:** [Dock white-glove guide](https://www.dock.us/library/white-glove-onboarding)

Dock provides branded customer workspaces with templated success plans, interactive checklists, embedded content, and workspace analytics. The workspace IS the onboarding — a shared space where the customer and the success team collaborate.

**Pattern:** The onboarding process is itself a workspace/artifact that the user can see, interact with, and track progress on.

**Ditto parallel:** Validates Insight-081's guided canvas. The onboarding experience should produce a visible workspace that fills in over time — not just a conversation that disappears. The user should be able to return to "what Ditto knows about me" and see it growing.

### 5.3 The Scaling Challenge

**Source:** [Command.ai](https://www.command.ai/blog/white-glove-vs-self-serve-onboarding-in-saas/), [EverAfter](https://www.everafter.ai/blog/high-touch-onboarding-and-how-to-do-it-right)

White-glove doesn't scale unless you automate the specialist. High-touch SaaS companies increasingly blend AI-driven onboarding with human handoffs.

**Pattern:** Start with AI doing 80% of the intake, surface the 20% that needs human judgment. Escalation, not replacement.

**Ditto parallel:** The Self IS the automated specialist. No human handoff needed. But the principle holds: the Self handles 80% of intake through structured questions and inference, and surfaces the 20% that requires the user's explicit judgment (pricing strategy, quality standards, trust disposition).

---

## 6. Needs Discovery Frameworks

### 6.1 SPIN Selling (Neil Rackham)

The classic consultative framework: **Situation** (understand current state) → **Problem** (identify pain) → **Implication** (show impact of the problem) → **Need-payoff** (make the solution feel urgent).

**Ditto parallel:** The SPIN arc maps to the Self's intake conversation. Situation → business context (dimensions 3, 7, 8). Problem → pain identification (dimensions 1, 4, 6). Implication → naming the cost of the status quo. Need-payoff → proposing how Ditto helps. The Architect should determine how tightly the Self follows this framework vs. a more organic flow.

### 6.2 Jobs-to-be-Done Interview (Tony Ulwick / Bob Moesta)

**Pattern:** Don't ask people what they want — ask about the last time they struggled with the job. Timeline: first thought → passive looking → active looking → deciding → first use → ongoing use.

**Ditto parallel:** The Self should ask "tell me about the last quote you wrote" more than "how does your quoting work?" Stories reveal the real process better than descriptions. The Self extracts structure from narrative.

### 6.3 The "Enough" Signal

**Source:** Internal (Insight-081)

The user never wonders "does the AI have enough?" because the system shows it:
- Overall progress indicator
- Per-area completeness
- The Self says "I've got enough to suggest your first process"
- Diminishing returns are visible

**This is original to Ditto.** No surveyed product shows the user how much the AI knows and what's still missing.

---

## Pattern Synthesis: What Can Ditto Build FROM?

| Pattern | Source | Composition level | How it applies |
|---------|--------|-------------------|---------------|
| Describe → Brainstorm → Refine → Deploy | Twin AI | pattern | Speed-to-first-value in onboarding |
| Knowledge-first setup (feed existing content) | Intercom Fin | pattern | Ingest documents/files during onboarding, not just questions |
| Progressive profiling (multi-session, value exchange) | HubSpot, Typeform | pattern | 9-dimension user model built across sessions, each question has visible payoff |
| Adaptive difficulty / assess through doing | Duolingo | pattern | Don't ask about complexity — discover it through work |
| Prompt coaching embedded in workflow | Wise Prompt Coach | pattern | AI coaching woven into corrections and reviews |
| White-glove 1:1 coaching with user's real data | Superhuman | pattern | Self as onboarding specialist, using real work from minute one |
| Structured onboarding workspace / visible progress | Dock, Insight-081 | original + pattern | Guided canvas with completeness indicators |
| Discovery as deliverable | Consulting practice | pattern | Knowledge synthesis card as standalone value |
| SPIN framework for needs discovery | Rackham | pattern | Situation → Problem → Implication → Need-payoff conversation arc |
| JTBD interviews (stories > descriptions) | Ulwick/Moesta | pattern | "Tell me about the last quote" > "how does quoting work?" |
| Dynamic form adaptation by case type | Legal intake (Clio, MyCase) | pattern | Questions adapt to industry/business type |
| "Enough" signal — visible knowledge completeness | Insight-081, Original to Ditto | original | No surveyed product shows AI knowledge completeness to user |
| AI collaboration coaching (ongoing) | Original to Ditto | original | No product actively coaches users to be better AI collaborators |
| Three-phase conversation (Gathering → Proposing → Working) | Insight-079, Original to Ditto | original | Visible transition from exploration to structured work |

---

## Gaps: What Doesn't Exist

1. **No AI product does deep business intake.** Every AI tool onboards to the tool. None onboard to a relationship where the AI deeply understands your business, goals, vision, and working style.

2. **No product coaches AI collaboration.** Duolingo coaches language. Superhuman coaches email. Nobody coaches "how to work with AI effectively" as an embedded, ongoing experience.

3. **No product shows knowledge completeness.** Users of ChatGPT, Claude, Notion AI can never see "what does the AI know about me?" and "what's missing?" The battleships model (Insight-081) is genuinely novel.

4. **No product transitions from intake to process visually.** The three-phase model from Insight-079 (Gathering → Proposing → Working) doesn't exist in any surveyed product. All either stay in chat or jump to a dashboard.

5. **No product combines progressive profiling with AI-driven suggestion.** HubSpot does progressive profiling for marketing. Ditto would do progressive profiling that directly powers proactive AI suggestions — every piece of context immediately improves the Self's next recommendation.

---

## Reference Docs Status

- **`docs/landscape.md`** — checked. No stale evaluations. Twin AI not previously evaluated; added finding but no landscape entry needed (it's a reference, not a build-from candidate).
- **`docs/research/persistent-conversational-identity.md`** — checked. Still current. ChatGPT/Claude memory patterns referenced above.
- **`docs/research/self-meta-processes-ux.md`** — checked. Section 1 (Onboarding) is the primary internal design reference. Still current and directly relevant.
- **Insights 074, 079, 080, 081** — all checked, all active, all directly relevant.
- **Insight-093** — the trigger. This research provides external patterns to ground the 9-dimension intake and AI coaching concepts.

Reference docs checked: no drift found.

---

## Addendum: Deep Research Findings (2026-03-24)

Extended research across 8 domains, with product-level detail and specific UX patterns.

### A1. Product-by-Product AI Onboarding Teardowns

#### Superhuman (Deep Dive — The Gold Standard)

**Source:** [First Round Review](https://review.firstround.com/superhuman-onboarding-playbook/)

Superhuman's onboarding is the single most documented and studied example of white-glove digital onboarding. Full detail:

- **Mandatory 1:1 sessions**: Initially 90 minutes (30 min discovery + 60 min onboarding), later refined to 30 minutes. Founder Gaurav Vohra personally onboarded hundreds before hiring specialists. At peak: dozens of specialists, thousands of sessions/week, tens of thousands onboarded annually.
- **Discovery component**: 10 pages of notes per session. 5-10 feature requests and 5-10 bugs captured per conversation — "insights impossible to gain from analytics alone."
- **Persona-based personalization**: Busy founders get Auto Labels, Split Inbox, Remind Me. Outbound salespeople get Write With AI, Snippets, Send Later. Different features emphasized per use case.
- **Habit formation tactics**: Verbal commitments to 30-day daily usage. Multi-email setup. Browser bookmarking. Default mail app config. Phone home-screen placement. Deletion of competing app bookmarks. Result: 65%+ full migration.
- **"Get Me To Zero" innovation**: Full-screen mandatory interruption — users pick a date and archive everything before it. 57% opt-in. Nearly 1 billion emails archived total. Non-skippable.
- **Economics**: Each specialist generated ~$650K ARR annually. 2x activation vs self-serve. 2x referral rates.
- **Transition to product-led (3 years)**: Three principles migrated — (1) **Opinionated**: identified the single best path, cut navigation teaching, prioritized outcome shortcuts. 50% increase in feature usage, 25% activation boost. (2) **Interruptive**: Full-screen mandatory panels got 98% completion vs 30% for optional checklists. 80% feature opt-in (up from 45%). (3) **Interactive**: "Do > Show > Tell" pedagogy. Safe sandbox with synthetic inbox. Muscle memory through action.
- **Inspiration sources**: Apple Genius Bar, 5-star hotels, Super Mario Bros 1-1 (opinionated teaching through experience), Legend of Zelda (attention-arresting guidance), Super Smash Bros (safe sandbox with full control).

**Key Ditto takeaway:** Superhuman proves 1:1 coaching generates insights no analytics can match. The Self IS the automated specialist, but the principles hold: work with real data, be opinionated about the right path, interrupt when important, teach through doing. The transition from human-led to product-led took 3 years — the principles, not the people, are what matters.

#### Notion — Personalized Branching Onboarding

**Source:** [Candu teardown](https://www.candu.ai/blog/how-notion-crafts-a-personalized-onboarding-experience-6-lessons-to-guide-new-users)

Six-lesson onboarding design:
1. Profile setup for ownership (name + photo → signals personalization)
2. Smart workspace detection (analyzes email domain, prevents duplicates, nudges toward existing teams)
3. Use case segmentation (adaptive survey: "What do you need?" + "How do you work?")
4. Visual UI preview (interface updates dynamically as user selects options — real-time visual feedback)
5. Workspace naming (establishes ownership)
6. Interactive walkthrough (adapted to selected use case, contextual feature highlighting)

**UX patterns used:** Progressive disclosure, branching pathways, real-time visual feedback, optional interactive overlays, milestone-based progress tracking, contextual task suggestions.

**Key Ditto takeaway:** The dynamic UI preview is powerful — as the user answers questions, they see their workspace taking shape. This directly validates Insight-080's artefact-primary surface: the user model should visually evolve during conversation.

#### Cursor — Migration-First Onboarding

**Source:** [Daily.dev setup guide](https://daily.dev/blog/setup-cursor-first-time)

Cursor's approach: recognize where users come from and make migration frictionless. First launch imports VS Code settings, extensions, keybindings, themes. The product looks identical to what the user already knows, plus new AI capabilities via Cmd+K. Minimal explanation needed — the familiar foundation reduces cognitive load.

**Key Ditto takeaway:** When onboarding users who already have processes/tools, migration of existing context (documents, templates, habits) should be seamless. Don't ask users to describe their workflow — import it.

#### Replit — Value Before Account

**Source:** [Replit homepage](https://replit.com/), [NoCode MBA guide](https://www.nocode.mba/articles/replit-ai-tutorial)

Replit offers loginless homepage experience — visitors run prompts directly on the website before account creation. The "Improve Prompt" button teaches prompt crafting during use. Structured approach: environment setup is automatic, users go straight to creation. Students get feedback 5x faster; course completion rates up 32%.

**Key Ditto takeaway:** The "Improve Prompt" button is an embedded coaching mechanism — it doesn't just fix the prompt, it shows users what a better prompt looks like. Relevant to Ditto's AI collaboration coaching.

#### Manus AI — Transparent Agent Onboarding

**Source:** [Technology Review](https://www.technologyreview.com/2025/03/11/1113133/manus-ai-review/), [NeuralStackly review](https://www.neuralstackly.com/tools/manus-ai-agent)

Landing page resembles ChatGPT — previous sessions in left column, chat input center, sample tasks curated by the company. Most users start in **supervised or checkpoint mode** to build trust, then move toward fuller autonomy. The agent actively asks clarifying questions and retains instructions as "knowledge" for future use. New users typically productive within first hour.

**Key Ditto takeaway:** The trust progression model (supervised → checkpoint → autonomous) maps directly to Ditto's trust tiers. Starting supervised and earning autonomy is validated by Manus's approach.

#### Cleo — Personality-First Conversational Onboarding

**Source:** [Writer.com brand analysis](https://writer.com/blog/big-sis-energy/)

Cleo is a fintech AI "money coach" with strong personality ("Big Sister Energy"). Onboarding is fully conversational with casual, relatable questions. Users engage 20x more than typical banking apps. Personality pillars: intelligence, honesty, empathy, humor. The emotional approach makes users "feel relaxed, safe and positive about their financial processes."

**Key Ditto takeaway:** Personality and tone matter enormously for onboarding. The Self's voice during intake should feel like talking to a knowledgeable, warm colleague — not a setup wizard. Cleo proves conversational personality drives engagement.

#### Harvey AI — Enterprise White-Glove Legal

**Source:** [Harvey.ai platform](https://www.harvey.ai/)

Enterprise-only: sales calls, demos, custom setup taking weeks to months. Includes intensive workshops, custom firm playbooks, hands-on training. Harvey Academy provides on-demand training, expert workflows, and step-by-step guidance. Built specifically for Am Law 100 firms.

**Key Ditto takeaway:** For complex domains, ongoing training resources (academy/playbooks) supplement initial onboarding. Ditto should similarly provide evolving guides as the user's processes become more complex.

#### Loom — Checklist-Driven Activation

**Source:** [Command.ai case study](https://www.command.ai/blog/loom-onboarding-case-study/)

Copy leads with the outcome: "Record your first Loom video in seconds." The checklist is laser-focused on the single aha moment — creating and sharing a video. No feature tours, no product explanations — just the shortest path to value.

**Key Ditto takeaway:** Ditto's first session should drive to ONE clear outcome: "Here's what I know about your business, and here's my first suggestion." Not a tour of features.

### A2. The Blank Prompt Problem (Critical UX Finding)

**Source:** [NextBuild research](https://nextbuild.co/blog/ai-blank-prompt-problem-ux-fix)

A blank text input is the highest-friction interface possible for AI products. Research findings:
- **60% of users who open an AI feature never send a message**
- Users face 4 cognitive barriers: What should I ask? What is this for? What questions work? Fear of error.
- Well-designed empty states convert 78% (vs 40% for blank boxes)
- Time to first prompt: 45 seconds (blank box) vs 8 seconds (designed empty state)
- **Return rate: 15% (blank box) vs 65% (designed empty state)**
- "The empty state is your real landing page"

**Solutions ranked by effectiveness:**
1. **Conversation starters** — clickable example prompts by category (3x engagement lift)
2. **Context-aware suggestions** — prompts based on current content/uploads
3. **Prompt templates** — structured fill-in-the-blanks for complex tasks
4. **Progressive disclosure** — multi-step prompt builders
5. **Data-driven examples** — suggestions from user's actual data
6. **Enhanced placeholder text** — action-oriented ("Get instant answers about your customer data") not generic ("Ask me anything")

**Key Ditto takeaway:** Ditto's first interaction should NEVER be a blank chat box. The guided canvas (Insight-081) solves this — structured inputs with visible information model. But even the chat fallback needs rich conversation starters tied to the user's context.

### A3. Jakob Nielsen's Prompt Augmentation Framework

**Source:** [Jakob Nielsen PhD Substack](https://jakobnielsenphd.substack.com/p/prompt-augmentation)

Nielsen identifies the **articulation barrier** — the gap between what users truly need and what they can express to AI. ~95% of users lack the writing skills for detailed, nuanced prompts.

**Six augmentation patterns:**
1. **Style Galleries** — visual collections of creative directions (Runway, Freepik). Users recognize desired styles visually rather than articulating verbally.
2. **Prompt Rewrite** — AI auto-enhances prompts (Leonardo's "prompt enhance"). "It is much easier to edit existing text than to create text from scratch."
3. **Targeted Prompt Rewrite** — user specifies direction for modification, receiving focused enhancements.
4. **Related Prompts** — follow-up suggestions based on initial query. Perplexity's follow-ups "doubled user engagement" per CEO.
5. **Prompt Builders** — structured dropdowns/selections instead of freeform text. Max 4 choices per dropdown for usability.
6. **Parametrization** — hybrid UI combining sliders/scales with text prompting (ChatGPT Canvas reading level slider).

**Core principle:** Recognition over recall — users select from presented options rather than generating descriptions from memory.

**Key Ditto takeaway:** The Self should employ multiple augmentation strategies: prompt builders for structured inputs (the guided canvas), prompt rewrite when the user gives vague instructions, related prompts after every interaction. The parametrization pattern (sliders for quality/detail/formality) maps to process configuration.

### A4. NN/g Research: New AI Users Need Support

**Source:** [NN/g](https://www.nngroup.com/articles/new-AI-users-onboarding/)

Research with first-time AI users found:
- Users confused AI chatbots with image generators or bank robots
- Inexperienced users asked the AI about its own capabilities (expected self-awareness)
- Feature discovery failures when tools provided inaccurate capability descriptions
- Tutorials assumed prerequisite knowledge users didn't have

**NN/g Recommendations:**
1. Skip long tutorials — address "What does this do?" and "How does it work?" directly
2. Introduce features contextually as users engage, not upfront
3. Tool names should indicate function (ChatGPT is clear; cryptic names confuse)
4. Provide broad general prompt examples, not niche ones
5. Ensure the AI has accurate self-knowledge of its capabilities
6. "Fundamental principles of interaction design remain unchanged"

**Source:** [NN/g Designing Use-Case Prompt Suggestions](https://www.nngroup.com/articles/designing-use-case-prompt-suggestions/)

Use-case prompt suggestions serve **learnability** — helping users grasp what the system enables. Key findings:
- **Pre-auth**: Highlight 3-5 core capabilities, minimize friction, trade simplicity for realism
- **Post-auth**: Context-aware suggestions beat generic ones. Instacart: "Nutritious snacks for kids" outperformed generic categories
- **Specificity wins**: Concrete language enables quick relevance assessment
- **Individualize by expertise**: Novice ("How do I create my first project?") vs Expert ("How can I automate recurring tasks?")
- **Placement matters**: Closer to input = higher engagement. Position near the input field.
- **Example libraries**: Curated prompt+output pairs (Midjourney model) — manually curated to maintain quality

**Key Ditto takeaway:** The Self's suggestions should be specific and contextual, not generic. After learning Rob's business, suggestions should be "Draft the Henderson plumbing quote" not "Try creating a document." Specificity signals understanding.

### A5. Shape of AI — Complete UX Pattern Library

**Source:** [Shape of AI](https://www.shapeof.ai)

Comprehensive taxonomy of AI UX patterns, organized by function:

**Wayfinders (Onboarding):** Gallery (sample generations), Follow-up (clarification requests), Initial CTA (open-ended input), Nudges (action alerts for new users), Prompt Details (reveal backend operations), Randomize (low-effort exploration), Suggestions (hint text), Templates (structured fill-ins).

**Inputs:** Auto-fill, Chained Action (workflow sequences), Describe, Expand, Inline Action, Madlibs (repeated generation with fixed format), Open Input, Regenerate, Restructure, Restyle, Summary, Synthesis, Transform.

**Tuners:** Attachments, Connectors (external data access), Filters, Model Management, Modes, Parameters, Preset Styles, Prompt Enhancer, Saved Styles, Voice and Tone.

**Governors (Oversight):** Action Plan (preview before execution), Branches (iterative history), Citations, Controls (pause/adjust), Cost Estimates, Draft Mode, **Memory** (user controls what AI retains), References, Sample Response, Shared Vision (collaborative visibility), **Stream of Thought** (reveals AI logic), Variations, Verification (confirmation before action).

**Trust Builders:** Caveat (limitation disclosure), Consent, Data Ownership, Disclosure, Footprints (traceability), Incognito Mode, Watermark.

**Key Ditto takeaway:** Several patterns map directly to Ditto's architecture: Memory (user model), Stream of Thought (provenance/auditability), Action Plan (supervised tier), Verification (trust gates), Footprints (provenance chain). The Governor patterns are the UX vocabulary for Ditto's trust system.

### A6. ChatGPT Memory — Continuous Learning Across Sessions

**Source:** [OpenAI Memory](https://openai.com/index/memory-and-new-controls-for-chatgpt/)

Two memory types: "saved memories" (user-requested) and "chat history" (AI-inferred insights from past conversations). Free users get lightweight short-term continuity; Plus/Pro users get longer-term understanding. Users control memory via Settings > Personalization > Manage Memory. The system gets better the more you use it.

**Key Ditto takeaway:** ChatGPT's memory is passive — it remembers what comes up. Ditto's user model is active — the Self seeks specific dimensions of understanding. The distinction: ChatGPT waits for context to appear; Ditto proactively asks questions to fill knowledge gaps. But the user control model (see/edit/delete what the AI knows) is directly relevant.

### A7. Duolingo — Adaptive Progressive Onboarding

**Source:** [Appcues analysis](https://goodux.appcues.com/blog/duolingo-user-onboarding), [UX Case Study](https://usabilitygeek.com/ux-case-study-duolingo/), [Propel retention analysis](https://www.trypropel.ai/resources/duolingo-customer-retention-strategy)

Core pattern: value before account creation. Users start learning without signing up — account creation comes after completing lessons, framed as "protecting your progress." First lessons designed as games: fast cycles, immediate correction, clear progress, low effort per session.

**Onboarding mechanics:**
- Initial questions about goals and preferences, NOT about existing knowledge
- Knowledge assessed through doing, not self-reporting
- Progressive teaching — mechanics introduced when they become useful, not all at once
- Gamification: streaks, points, levels, rewards (52% of users find gamification personally motivating)
- Lessons start simple and gradually increase difficulty — always in the "zone of proximal development"

**Key Ditto takeaway:** The split between asking about goals (explicit) and assessing capability through doing (implicit) is critical for Ditto. During onboarding, ask Rob what he wants to achieve (goals, pain points); during the first real task, discover how he actually works (quality standards, communication style, tool proficiency).

### A8. Professional Services Intake — Deeper Findings

#### Legal Intake Automation Tools

**Source:** [MyCase](https://www.mycase.com/blog/ai/automated-legal-intake/), [Voiceflow](https://www.voiceflow.com/blog/law-firm-ai), [Clio](https://www.clio.com/blog/3-ways-automate-client-intake/), [Intaker](https://www.intaker.com/home/)

Specific products: Smith.ai (AI receptionists + AI chat, 24/7 client serving), Lawmatics (#1 legal CRM with automated intake), Lawprocess (conversational intake with real-time visibility), Clio Grow (Matter Pipeline showing status of potential clients). Key capabilities: dynamic questionnaire adaptation, automated conflict checking, case value assessment, real-time case screening, CRM auto-integration.

**Stat:** Law firms save 32.5 working days per attorney annually. Large firm AI adoption: 39%; small firm adoption: ~20%.

**Critical constraint:** 16 state bars address AI + legal ethics. All nine state bar ethics opinions emphasize attorneys' supervisory duties requiring human oversight of AI-generated client assessments.

**Key Ditto takeaway:** Legal intake proves that conversational AI + dynamic forms + professional oversight is a proven pattern. The ethics constraint (human oversight of AI assessments) parallels Ditto's trust tier model.

#### SPIN Selling — Full Framework for AI Implementation

**Source:** [Oliv.ai SPIN guide](https://www.oliv.ai/blog/spin-selling-explained), [Sybill SPIN guide](https://www.sybill.ai/blogs/spin-selling-guide)

Developed from analysis of 35,000+ sales conversations. Four question types:
- **Situation**: "Tell me about your current quoting process" (understand context)
- **Problem**: "Where does it break down?" (identify pain)
- **Implication**: "What happens when a quote takes too long?" (show consequences)
- **Need-payoff**: "If you could send accurate quotes in minutes, what would that mean?" (create urgency)

AI implementations now provide: automated tracking of SPIN question types across all calls, suggested Implication questions based on discovered Problems, Need-Payoff prompts tied to prospect's articulated priorities, post-call coaching evaluating conversations against the framework.

**Top performers**: 10-15 high-quality open-ended questions. Deals with 11-14 questions close at 74% higher rates. Interviewer talks <40%.

**Key Ditto takeaway:** The Self's intake conversation should follow SPIN arc but feel natural. The AI tracking/coaching tools show this can be automated — the Self can monitor its own conversation quality against the SPIN framework.

### A9. HubSpot Onboarding — Enterprise Guided Setup

**Source:** [Project36 guide](https://www.project36.io/blog/hubspot-onboarding-guide-step-by-step-process-for-success-in-2025), [HubSpot Academy](https://www.hubspot.com/academy/academy-onboarding)

Four unique onboarding tracks. Smart CRM Essentials track: import records, customize layouts, make connections. 365 days of unlimited access to all content. Recommended timeframe: up to 3 months. Workshop series led by inbound professors.

**Key Ditto takeaway:** The 3-month timeline validates multi-session onboarding. HubSpot doesn't try to onboard in one session — they give a year of access to learning content. Ditto's 9-dimension user model should similarly unfold over weeks, not minutes.

### A10. Salesforce Setup with Agentforce

**Source:** [Salesforce Admins blog](https://admin.salesforce.com/blog/2025/introducing-setup-powered-by-agentforce)

Salesforce introduced AI-powered setup: users type natural language requests in a Setup Home utterance box. The agent creates objects, fields, manages users, troubleshoots access. **Always seeks confirmation before taking action.** Only assists with tasks the requestor has permissions for. All changes logged in Setup Audit Trail.

**Key Ditto takeaway:** The "always seeks confirmation" pattern is relevant to Ditto's supervised trust tier. The natural-language-to-action model (type what you want, AI configures it) is the target for process creation.

### A11. Intercom Fin — Training and Deployment

**Source:** [Intercom Help](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained)

Setup in under an hour for existing Intercom users. Learns from Help Center articles, internal content, PDFs, webpages. Customizable tone of voice. Supports 45+ languages. Test changes before going live. Since March 2025: "Fin Tasks" replaced Custom Answers for new customers — more flexible, action-oriented.

**Key Ditto takeaway:** The knowledge-first approach (feed existing content, AI learns from it) should be Ditto's primary onboarding path for users with existing documents. "Upload your quote template and I'll learn your pricing structure" > "Tell me about your pricing."

### A12. Ada — Coaching on Past Conversations

**Source:** [Fini Labs overview](https://www.usefini.com/guides/ada-agentic-ai-customer-support-guide)

Ada's distinctive feature: coaching on past conversations — tweaking tone, adding context, refining responses — is automatically applied to all future interactions. Build & Configure phase: weeks 5-8 for API connections, custom skills, conversation flows. Ada Academy for self-service learning.

**Key Ditto takeaway:** "Coaching on past conversations that automatically improves future interactions" is exactly Ditto's learning model. When Rob corrects a quote, that correction should permanently improve future quotes — not just the current one.

### A13. Workflow Tool Onboarding Patterns

**Zapier**: Quick Account Creation feature skips standard signup and onboarding survey entirely. Zap Templates surface specific use cases with clear titles and descriptions to inspire automation. Value proposition: "connect form submissions, sheet updates, and booking systems" — concrete, not abstract.

**Monday.com**: Quick setup, visual interface, "start simple then scale." Works for technically averse team members. Visual pipeline views (like Cleo's Matter Pipeline) show status at a glance.

**n8n**: Very complex, built for technical users. Excels at multi-path logic but poor for non-technical onboarding.

**Key Ditto takeaway:** Templates are the bridge between "blank canvas" and "productive use." Ditto's pre-baked processes serve this role — but they should be presented as starting points the Self can customize, not as rigid structures.

### A14. Progressive Profiling — Implementation Detail

**Source:** [Typeform](https://www.typeform.com/blog/progressive-profiling-collect-better-data), [Descope](https://www.descope.com/learn/post/progressive-profiling), [Auth0](https://auth0.com/blog/progressive-profiling/)

**Core mechanics:**
- Adaptive forms check if user is already known — hide known fields, show new questions
- One question at a time reduces cognitive load (Typeform: 72% higher completion rates)
- **Strategic timing**: Never during conversion milestones. Never interfere with purchase decisions.
- **Pacing**: Space questions evenly. Ask a few, wait, trigger more.
- **Conversational tone**: Clear, not mechanical.
- **86% of users quit overly long forms** — progressive profiling is the antidote.

**Trust-based disclosure curve:** Small commitment up front → user experiences value → relationship builds → user willingly provides more detail over time.

**Key Ditto takeaway:** Every additional question Ditto asks should have an immediate, visible payoff. "Tell me your typical markup percentage" → immediately see it applied to the quote being built. The value exchange must be tangible and instant.

### A15. The Wise Prompt Coach (Detailed)

**Source:** [Wise Design Blog](https://medium.com/transferwise-design/from-playtime-to-practice-designing-ai-with-the-prompt-coach-71e6ac672ac2)

A Gemini Gem built from: a role definition, clearly defined task, explicit guardrails and principles, encyclopaedic prompt design knowledge, and conversation flows. Design philosophy: "People learn faster when they're having fun and when they feel safe." Voice is "cheeky but kind" — British self-deprecation.

The Coach doesn't rewrite prompts — it educates users on why their prompt produced a certain result and how to improve it. It uses personality and engaging feedback to make people curious about their next iteration.

**Hinge parallel:** Hinge's "Prompt Feedback" feature offers three levels: "Great Answer," "Try a Small Change," "Go a Little Deeper" — personalized guidance at calibrated intensity.

**Key Ditto takeaway:** Ditto's AI collaboration coaching should use the three-tier feedback model: acknowledge good input ("That's exactly the detail I needed"), suggest small improvements ("Next time, mentioning the timeline helps me prioritize"), and request deeper input when critical ("To price this accurately, I need to understand your material costs"). The tone should be warm and encouraging, never condescending.

---

## Updated Synthesis: The Ditto Onboarding Stack

Based on all research, Ditto's onboarding should combine these proven patterns into something no single product offers:

| Layer | Pattern | Source | Ditto Implementation |
|-------|---------|--------|---------------------|
| **First 5 seconds** | Designed empty state, not blank box | NextBuild research | Guided canvas with visible information model |
| **First session** | Value before account (let them try) | Duolingo, Replit | First conversation produces visible user model artifact |
| **First task** | Work with real data, not demos | Superhuman | Self uses user's actual documents/context from minute one |
| **Ongoing** | Progressive profiling with value exchange | Typeform, HubSpot | Every question has immediate visible payoff |
| **Multi-session** | Active knowledge seeking, not passive memory | Original (vs ChatGPT) | Self proactively fills information gaps |
| **Coaching** | Three-tier feedback on AI collaboration | Wise Prompt Coach, Hinge | Acknowledge / Suggest / Request deeper input |
| **Teaching** | Prompt augmentation (6 patterns) | Jakob Nielsen | Prompt builders, rewrite, related prompts, parametrization |
| **Trust** | Supervised → checkpoint → autonomous | Manus AI, Superhuman | Start supervised, earn autonomy through demonstrated competence |
| **Transparency** | Visible knowledge completeness | Original to Ditto | "Battleships model" — user sees what AI knows and what's missing |
| **Personality** | Warm, knowledgeable colleague tone | Cleo, Superhuman | Not a wizard, not a chatbot — a professional who remembers |
| **Discovery** | SPIN arc (Situation → Problem → Implication → Need-payoff) | Rackham, consulting practice | Natural conversation following structured discovery framework |
| **Templates** | Pre-built starting points, not blank canvases | Zapier, Notion | Pre-baked processes the Self customizes based on intake |

### Critical Statistics for Architecture Decisions

- 60% of users never send first message to a blank prompt box (NextBuild)
- 98% completion for mandatory full-screen setup vs 30% for optional checklists (Superhuman)
- 120% conversion increase when reducing form fields from 11 to 4 (HubSpot)
- 72% higher completion with one-question-at-a-time (Typeform)
- 65% return rate within 7 days with designed empty state vs 15% with blank box (NextBuild)
- Deals with 11-14 discovery questions close at 74% higher rate (Gong.io via SPIN research)
- 20x engagement for personality-first conversational AI (Cleo vs banking apps)
- 2x activation and 2x referrals from white-glove onboarding (Superhuman)
- 86% of users quit overly long forms (progressive profiling research)
- 95% of users lack skills for detailed AI prompts (Jakob Nielsen)

### Sources Index

- [UserGuiding: How Top AI Tools Onboard](https://userguiding.com/blog/how-top-ai-tools-onboard-new-users)
- [First Round Review: Superhuman Onboarding Playbook](https://review.firstround.com/superhuman-onboarding-playbook/)
- [Candu: Notion Onboarding Teardown](https://www.candu.ai/blog/how-notion-crafts-a-personalized-onboarding-experience-6-lessons-to-guide-new-users)
- [NextBuild: AI Blank Prompt Problem](https://nextbuild.co/blog/ai-blank-prompt-problem-ux-fix)
- [Jakob Nielsen: Prompt Augmentation](https://jakobnielsenphd.substack.com/p/prompt-augmentation)
- [NN/g: New AI Users Need Support](https://www.nngroup.com/articles/new-AI-users-onboarding/)
- [NN/g: Designing Use-Case Prompt Suggestions](https://www.nngroup.com/articles/designing-use-case-prompt-suggestions/)
- [Shape of AI: UX Pattern Library](https://www.shapeof.ai)
- [OpenAI: Memory and Controls](https://openai.com/index/memory-and-new-controls-for-chatgpt/)
- [Dock: White-Glove Onboarding Guide](https://www.dock.us/library/white-glove-onboarding)
- [Command.ai: White-Glove vs Self-Serve](https://www.command.ai/blog/white-glove-vs-self-serve-onboarding-in-saas/)
- [Typeform: Progressive Profiling](https://www.typeform.com/blog/progressive-profiling-collect-better-data)
- [HubSpot: Progressive Profiling](https://blog.hubspot.com/blog/tabid/6307/bid/34155/how-to-capture-more-and-better-lead-intel-with-progressive-profiling.aspx)
- [Descope: Progressive Profiling 101](https://www.descope.com/learn/post/progressive-profiling)
- [Auth0: Progressive Profiling](https://auth0.com/blog/progressive-profiling/)
- [Appcues: Duolingo Onboarding](https://goodux.appcues.com/blog/duolingo-user-onboarding)
- [Writer.com: Cleo Brand Analysis](https://writer.com/blog/big-sis-energy/)
- [Wise Design: Prompt Coach](https://medium.com/transferwise-design/from-playtime-to-practice-designing-ai-with-the-prompt-coach-71e6ac672ac2)
- [Oliv.ai: SPIN Selling Guide](https://www.oliv.ai/blog/spin-selling-explained)
- [Sybill: SPIN Selling Guide](https://www.sybill.ai/blogs/spin-selling-guide)
- [Harvey AI Platform](https://www.harvey.ai/)
- [Intercom: Fin AI Agent](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained)
- [Ada: Fini Labs Overview](https://www.usefini.com/guides/ada-agentic-ai-customer-support-guide)
- [MyCase: Automated Legal Intake](https://www.mycase.com/blog/ai/automated-legal-intake/)
- [Clio: Automate Client Intake](https://www.clio.com/blog/3-ways-automate-client-intake/)
- [Salesforce: Setup with Agentforce](https://admin.salesforce.com/blog/2025/introducing-setup-powered-by-agentforce)
- [HubSpot Academy: Guided Onboarding](https://www.hubspot.com/academy/academy-onboarding)
- [Command.ai: Loom Case Study](https://www.command.ai/blog/loom-onboarding-case-study/)
- [Manus AI: Technology Review](https://www.technologyreview.com/2025/03/11/1113133/manus-ai-review/)
- [OpenAI Academy](https://academy.openai.com/)
- [Daily.dev: Cursor Setup Guide](https://daily.dev/blog/setup-cursor-first-time)
- [UX Design Institute: Onboarding Best Practices](https://www.uxdesigninstitute.com/blog/ux-onboarding-best-practices-guide/)
