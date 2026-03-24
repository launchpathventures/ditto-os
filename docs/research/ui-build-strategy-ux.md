# UX Spec: UI Build Strategy — References, Subframe Prompts, Quality Gates

**Date:** 2026-03-24
**Role:** Dev Designer
**Status:** Draft v2 — exact tokens, handoff process, workspace prompt, mobile variants, emoji fix
**Consumers:** Dev Architect (Brief 039 update), Dev Builder (implementation workflow)
**Depends on:** `docs/research/visual-identity-design-system-ux.md`, `docs/research/phase-10-mvp-dashboard-ux.md`

---

## The Strategy: Design Tokens → Subframe Hero Components → Reference-Driven Build → Visual QA

Four layers, in order:

1. **Design tokens first** — Bake the visual identity into Tailwind/shadcn theme config before any component work. This prevents the "generic shadcn" problem at the foundation level.

2. **Subframe for 6 hero components** — The components that define Ditto's personality get designed visually in Subframe, not generated from prompts. These are: Conversation Surface, Feed Card, Prompt Input, Sidebar Navigation, Shift Report, and Process Detail.

3. **Reference-driven build for everything else** — Builder uses reference screenshots as context when implementing secondary components. Visual references anchor quality better than written specs.

4. **Visual QA gate** — After each component, screenshot it, review against references, iterate. No "build the whole page then assess."

### Subframe-to-Code Handoff Process

Subframe exports React + Tailwind code. **Do NOT import Subframe's generated code directly into the project.** Treat Subframe output as a **visual reference and code pattern guide**. The Builder:

1. Designs in Subframe using the prompts below
2. Designer (human) validates the Subframe output against the visual identity spec — approves, adjusts, or iterates
3. Builder rebuilds the approved design using the project's shadcn/ui primitives + Ditto's design tokens in `globals.css`
4. Builder references Subframe's generated code for layout patterns, spacing decisions, and component composition — but uses shadcn `<Card>`, `<Button>`, `<Input>` etc. as the actual implementation primitives

This ensures: consistent component API with the rest of the codebase, design tokens applied at the theme level (not hardcoded per component), and shadcn's accessibility built in.

### Reference Screenshot Convention

Store reference screenshots in `docs/references/`. Capture at:
- **Desktop:** 1440px viewport width
- **Mobile:** 375px viewport width
- **Format:** PNG, named descriptively (e.g., `granola-meeting-view.png`, `intercom-fin-conversation.png`)

When asking AI to implement a component, include the reference path: "Reference: `docs/references/mercury-sidebar.png`"

---

## Part 1: Reference UIs — What to Look At and Why

### Strategy Update: Option 2 — HTML/CSS Prototyping First

Subframe produced generic output. The revised strategy is:

1. **Design tokens configured** (visual identity spec — done)
2. **HTML/CSS prototypes for hero components** — standalone HTML files using Tailwind CDN. No React, no shadcn. Creative freedom. These become the visual target.
3. **Builder implements from HTML prototypes** — treats them as pixel-level references when rebuilding in React/shadcn
4. **Visual QA** — screenshot comparison against HTML prototypes

HTML prototypes live in `docs/prototypes/`. Each is a self-contained `.html` file viewable in any browser.

---

### Tier 1: Primary References (study these closely)

These products nail the exact intersection Ditto needs: warm, trustworthy, conversation-aware, non-technical users.

#### 0. Cockpit — "The Structural Blueprint" (STRONGEST REFERENCE)

**Why it's relevant:** An AI executive workspace that does almost exactly what Ditto does — morning briefing ("Good morning, Jay. Two things need your attention"), decision queue with inline actions, status cards with narrative interpretations, live AI signal panel, and a conversation input bar. The closest existing product to Ditto's interaction model.

**What to study:**
- Cockpit 2: Morning briefing pattern — numbered attention items, inline action buttons ("Discuss with Sentinel"), narrative not data-first
- Cockpit 3: Decision queue — prioritised cards with orange accent bar, action buttons (Yes/Pass), context lines
- Cockpit 2: Status cards — "Strong and improving" / "Steady — keep watching" / "Needs attention" with colour-coded headers and brief narrative
- Cockpit 1: Right panel as live AI context — signals streaming, proactive suggestions, action items
- Bottom input bar: "Message Sentinel..." — same pattern as "What's on your mind?"

**What to change for Ditto:**
- Light mode with warm palette (cream + terracotta), not dark + teal
- Much less data density — narrative first, numbers secondary
- Conversation-first entry point (Cockpit 2's briefing as full-screen for new users)
- User language throughout ("Henderson quote" not "Portfolio Health: 69/100")
- Spacious, not compact — Rob is scanning on his phone, not analysing at a trading desk

**Reference files:** `docs/references/Cockpit 1.png`, `Cockpit 2.png`, `Cockpit 3.png`

#### 1. Granola (granola.ai) — "The Warm AI Colleague"

**Why it's relevant:** AI meeting notes tool that feels like a competent colleague, not a tool. Non-technical users. Warm typography, spacious layout, conversational tone.

**What to study:**
- Their use of serif/modern hybrid typography for warmth
- The "Ask Granola anything" prompt — conversational, inviting, not technical
- Generous whitespace that makes the interface feel calm
- How AI-generated content is presented alongside user content without visual jarring
- The onboarding flow — conversational, not wizard-based

**What transfers to Ditto:** The overall *feeling*. This is the closest product to what Ditto's conversation surface should feel like. Warm, calm, competent, uncluttered.

**Look at:** granola.ai — focus on their meeting notes view, how AI suggestions appear inline

---

#### 2. Intercom Messenger (intercom.com) — "Warm Business Conversation"

**Why it's relevant:** The gold standard for business conversation UI. Their Fin AI agent is the closest existing product to Ditto's Self — an AI that converses with users about business operations.

**What to study:**
- Message bubble styling — rounded, warm, not sharp
- How structured content (product cards, article suggestions, quick replies) appears within conversation
- The Fin AI agent's response format — how it presents actions, links, and recommendations inline
- Quick reply buttons below messages — how approve/reject-style actions integrate into chat flow
- Their custom typography ("Honey" font) — warm but opinionated

**What transfers to Ditto:** The conversation surface interaction model. How the Self presents structured work items (quotes, reports, trust decisions) within a conversation flow. How action buttons sit within messages.

**Look at:** intercom.com/fin — the AI agent conversation UI, not the admin dashboard

---

#### 3. Mercury (mercury.com) — "Trustworthy Business Dashboard"

**Why it's relevant:** Banking dashboard for startups. Clean, data-rich, warm enough for non-technical founders. The workspace view that Ditto's three-panel layout should aspire to.

**What to study:**
- Their dashboard typography — clear hierarchy, warm near-black text, spacious
- How financial data is presented cleanly without overwhelming (Rob sees quote amounts, Lisa sees pricing data)
- Card-based layout with generous whitespace
- The sidebar navigation — clean, minimal, content-first
- How they handle empty states and loading states

**What transfers to Ditto:** The workspace/dashboard feel. When Ditto's three-panel layout appears, it should feel like Mercury — clean, data-competent, warm, trustworthy. Not like a developer dashboard.

**Look at:** mercury.com — their transaction dashboard, account overview, sidebar navigation

---

#### 4. Gusto (gusto.com) — "Approachable Business Tool for Non-Accountants"

**Why it's relevant:** Payroll/HR for small business owners. Their users ARE our users — Rob-type people who need to approve things, review outputs, and trust a system to handle operational work. Warm, friendly, not condescending.

**What to study:**
- How they present actionable items (payroll to run, approvals needed) — friendly, clear, not alarming
- Their use of illustration and colour to differentiate sections without creating visual noise
- The approval flow — how users confirm payroll, approve time off
- Dashboard customisation — users choose what matters
- How they handle the "business tool that doesn't feel corporate" challenge

**What transfers to Ditto:** The tone of the structured workspace. Feed cards presenting "needs your eye" items should feel like Gusto's actionable items — clear, friendly, trustworthy. Not like Jira tickets or monitoring alerts.

**Look at:** gusto.com — their employer dashboard, payroll run flow, time-off approval

---

### Tier 2: Conversation Detail References (study for specific components)

#### 5. Claude.ai — "Cream Background, Warm Conversation"

**Study specifically:**
- The cream/parchment background colour (`oklch(0.97 0.02 70)` / `#F4F3EE`) — this IS the warmth
- How artifacts (substantial outputs) render alongside conversation in a side panel
- Message rendering without hard bubbles — more like a document than a chat
- The absence of visual noise — no avatars, no timestamps cluttering the flow
- Progressive rendering during streaming — styles apply, then content appears

**What transfers:** The conversation surface background colour and the "no hard bubbles" approach. The Self's messages should feel like a colleague writing to you, not like a chatbot responding.

---

#### 6. Apple Messages for Business / WhatsApp Business — "Rich Cards in Chat"

**Study specifically:**
- How product cards (image + title + price + action) appear within message bubbles
- List pickers — multi-item selection presented inline in conversation
- Quick reply buttons that sit below a message
- How structured data remains conversational, not form-like

**What transfers:** The Self needs to present structured content inline — quote summaries, approval cards, data tables, trust change proposals. These should feel like WhatsApp product cards, not like embedded forms. Rob's reference point is WhatsApp — design for his mental model.

---

#### 7. Telegram Inline Keyboards — "Action Buttons in Context"

**Study specifically:**
- Buttons that appear directly below relevant messages
- How pressing a button edits the keyboard in-place (no new message)
- The visual styling — simple, rectangular, grid layout
- Multi-selection patterns — toggle without sending

**What transfers:** Approve/reject/edit buttons in the Self's conversation. When the Self presents a quote for review, the action buttons should sit directly below the quote content — like Telegram inline keyboards, not like a separate action bar.

---

### Tier 3: Premium Feel References (study for polish and quality bar)

#### 8. Superhuman — "Speed + Elegance"

**Study:** Custom typography (Super Sans), keyboard-first interaction, visual restraint, the premium feeling that comes from thoughtful details rather than decoration.

**What transfers:** The quality bar. Everything in Ditto should feel this considered — from hover states to transition timing to font rendering.

---

#### 9. Things 3 / Bear — "Warm Minimalism"

**Study:** How minimalism and warmth coexist. Subtle animations. Generous whitespace. Theme customisation. The Apple Design Award level of craft.

**What transfers:** Micro-interactions. The approval checkmark animation. Card expand/collapse transitions. The feeling of delight from things being well-made.

---

#### 10. Calm — "Emotional Design Through Colour"

**Study:** Deep blue foundation for trust and calm. Soft transitions. No hard edges. How colour psychology creates a feeling before the user reads a word.

**What transfers:** Ditto's background colours and overall colour strategy. The user should feel calm when they open Ditto — not anxious about what needs attention.

---

## Part 2: Subframe Design Prompts

Six hero components designed in Subframe. These define Ditto's personality. Everything else follows their lead.

**Shared context for all prompts** (prepend to each):

> Design context: Ditto is an AI workspace for non-technical business users (trades business owners, ecommerce managers, team leads). The visual identity is "warm professional" — trustworthy, approachable, calm, human. Think: a competent colleague's workspace, not a developer tool.
>
> Exact design tokens (use these, not approximations):
> - Page background: hsl(40 20% 98%) — warm cream, NOT pure white
> - Card/surface background: hsl(40 15% 96%)
> - Elevated surfaces (modals, popovers, input fields): hsl(0 0% 100%)
> - Primary text: hsl(30 10% 15%) — warm near-black, NOT #000
> - Secondary text: hsl(30 6% 40%)
> - Muted text (timestamps): hsl(30 4% 50%)
> - Accent colour (buttons, links, Self indicator): hsl(24 80% 38%) — deep warm terracotta
> - Accent hover: hsl(24 80% 32%)
> - Accent subtle background: hsl(24 60% 95%)
> - Text on accent: white
> - Borders: hsl(40 10% 90%)
> - Positive/success: hsl(145 55% 40%) — muted green
> - Caution/warning: hsl(48 85% 50%) — amber-yellow
> - Error: hsl(0 65% 50%) — warm red
>
> Typography: Inter variable font. Body 16px/400, headings 20-25px/500-600, line-height 1.5-1.6.
> Spacing: 4px grid. Card padding 16-20px, between cards 24px, sections 32px.
> Radius: 8px buttons/inputs, 12px cards, 16px modals.
> Shadows: Minimal. hsl(30 10% 15% / 0.05) for subtle, 0.08 for medium.
> Icons: Lucide icons (line, 1.5px stroke). No emoji in the UI.
>
> Reference products: Granola (warm AI), Intercom Fin (business chat), Mercury (clean dashboard), Gusto (approachable business tool).

---

### Prompt 1: Conversation Surface (The Self)

This is the most important component. The Self IS the product.

> Design a full-screen conversation interface for an AI assistant called "the Self" — a warm, competent business colleague.
>
> The conversation surface should feel like talking to a trusted advisor, not using a chatbot.
>
> Layout:
> - Full-width conversation area with max-width ~700px centred
> - Messages from the Self on the left, user messages on the right
> - The Self is identified by a small warm-orange filled dot (8px) next to its messages — NOT an avatar, NOT a robot icon, NOT initials. Just a warm dot.
> - User messages have a very subtle warm tint background
> - Self messages sit on the default surface — no bubbles, more like a document conversation
> - Generous vertical spacing between messages (24px)
> - Timestamps are subtle, appearing only when there's a time gap
>
> The Self's messages can contain:
> - Regular text (the primary case)
> - Inline data: small tables (3-5 rows), progress bars, sparkline charts
> - Action buttons below a message: "Send as-is" / "Bump labour" / "Show me the detail" — styled as rounded secondary buttons, not aggressive CTAs
> - A quote/work-item card embedded in the conversation: a subtle warm-toned card with title, key details (2-4 lines), and inline action buttons
>
> Show a realistic conversation: the Self greeting a returning user with a morning briefing — "Morning Rob. Two things:" followed by a quote summary card with approve/adjust buttons, then a follow-up mention, then "Everything else is running fine."
>
> Input area at the bottom: sticky, with placeholder "What's on your mind?", a subtle microphone icon and paperclip icon on the right. Focus state shows a warm orange border.
>
> Background: warm cream (#F8F6F2), not pure white. Text: warm near-black, not #000.
>
> Feel: Calm, spacious, like a relaxed conversation with a smart colleague. NOT like a customer support chat widget. NOT like Slack. NOT like a terminal.
>
> IMPORTANT: This conversation surface appears in TWO contexts:
> 1. Full-screen (new users, low volume) — max-width ~700px centred, generous vertical margins
> 2. Right panel in three-panel workspace (established users) — 320px wide (w-80), same visual treatment but narrower
>
> Design for full-screen first. The right-panel variant should be the same component at a narrower width — messages may need to adjust max-width but the visual language stays identical.
>
> Also provide a mobile variant (375px viewport): messages full-width, input sticky at bottom, touch-friendly sizing (44px minimum tap targets).

---

### Prompt 1b: Conversation Surface — Mobile (375px)

> Using the exact same design language as the desktop conversation surface above, show the mobile variant at 375px width.
>
> Changes from desktop:
> - Messages take full width (no centred max-width)
> - Input area is sticky at bottom with safe-area inset padding for iOS
> - Action buttons within messages stack vertically if they don't fit horizontally
> - Touch targets are minimum 44px × 44px
> - The Self's morning briefing message may be longer than the viewport — scrollable, with the input always visible
>
> Show the same "Morning Rob" briefing conversation on a mobile viewport. This is how Rob sees Ditto at 6:30am in his truck.

---

### Prompt 2: Feed Card — "Needs Your Eye"

> Design a review card for a work item that needs the user's attention. This appears in a vertical feed alongside other cards.
>
> Context: This is a quote that an AI process generated and needs the business owner to review before it goes to a customer.
>
> Card layout:
> - Warm orange left accent bar (3px, border-radius matches card)
> - Card title: "Henderson bathroom reno" (the customer's name and job — user language, not "Quote #47")
> - Subtitle: "Ready for you · Drafted 2 hours ago"
> - Content summary: Key details in a compact but readable layout — "Materials: $8,400 · Labour: 18 hours ($4,200) · Total: $14,200 (25% margin)"
> - A soft note from the Self: "Labour might be low for a bathroom — similar jobs averaged 22 hours" — styled as a warm subtle callout, not a warning banner
> - Action buttons: "Approve & Send" (primary, warm orange), "Adjust" (secondary, outlined), "Discuss" (ghost/text button)
>
> Card styling:
> - Background: slightly elevated from page (#FFFFFF on cream page, or very subtle shadow)
> - Border-radius: 12px
> - Generous internal padding (20px)
> - No harsh borders — use elevation and background contrast
>
> States to show:
> - Default (described above)
> - Hover: very subtle lift/shadow
> - The Self's note should feel like a colleague's aside, not a system warning

---

### Prompt 3: Prompt Input (The Primary Interaction Element)

> Design the text input area that the user types into to communicate with the Self. This is the most-used interactive element in the entire product.
>
> Specifications:
> - Auto-resizing textarea (grows from 1 line to max ~6 lines)
> - Placeholder text: "What's on your mind?" in warm muted grey
> - Right side: subtle microphone icon ([Mic icon]) and paperclip icon ([Paperclip icon]) — functional, not decorative, in muted grey
> - Send button appears only when there's text — a warm orange circle with an arrow or send icon
> - Border: subtle warm grey default, warm orange on focus (the focus ring says "I'm listening")
> - Background: slightly elevated (#FFFFFF) from the conversation area
> - Border-radius: 12px (matching card radius — this is a container, not an inline input)
> - Padding: 16px internal
>
> Show three states:
> 1. Empty (placeholder visible, no send button, mic and paperclip visible)
> 2. Active with text ("Bump Henderson to 22 hours and send" — send button appears, warm orange focus border)
> 3. Self is responding (input dimmed slightly, "Working on it..." text replaces placeholder, three subtle dots pulsing gently)
>
> This should feel like the text field in iMessage or WhatsApp — familiar, comfortable, not like a search bar or a form field.

---

### Prompt 4: Sidebar Navigation

> Design a left sidebar navigation for a workspace app. The user is a small business owner with 3-5 recurring processes and a few active work items.
>
> Sidebar width: 256px (w-64)
> Background: slightly darker/warmer than the main content area
>
> Sections:
>
> 1. App header: "Ditto" in semibold text (not a logo, just the name). Below it, a subtle one-line status: "All quiet" or "2 things need you"
>
> 2. "My Work" section — active items using the user's own names:
>    - "Henderson quote ●" (orange dot = needs attention)
>    - "CRM research" (no indicator = in progress, nothing needed)
>    - "Wilson follow-up" (no indicator)
>
> 3. "Recurring" section — the user's running processes:
>    - "Quoting ✓" (green checkmark = running smoothly)
>    - "Follow-ups ✓"
>    - "Supplier tracking ⚠" (amber indicator = something flagged)
>
> 4. A subtle divider
>
> 5. "How It Works" — link to capability map (deferred, just a placeholder)
>
> 6. "Settings" at the bottom
>
> Design rules:
> - Items have 44px height (touch-friendly)
> - Status indicators are small, coloured dots or icons — not badges with numbers
> - Active/selected item has a warm-tinted background
> - Hover state: subtle background shift
> - Empty sections are hidden, not shown hollow
> - Section headers are uppercase text in muted colour, 12px — or better, just slightly bolder weight
> - Navigation feels quiet and organised, like a clean desk drawer
>
> Show a sidebar for "Rob" who has 2 active work items and 3 recurring processes.

---

### Prompt 5: Shift Report Card (The Morning Brief)

> Design the top card in a feed — the "shift report" that summarises what's happened and what needs attention. This is the first thing the user sees when they open the workspace view.
>
> Context: This is like a morning brief from a reliable executive assistant. It's narrative, not a data table.
>
> Card layout:
> - No left accent bar (this is the overview, not a specific action)
> - Self's warm dot indicator in the top-left corner (this came from the Self)
> - Title: "This morning" or "Since yesterday" — temporal, not "Daily Brief"
> - Content: A few paragraphs of conversational summary:
>   "2 quotes ready for you. Henderson bathroom ($14,200) and Wilson kitchen ($8,900). Henderson's labour might be low — I'd check it."
>   "Follow-ups are running fine. 3 sent yesterday, 1 response received."
>   "Supplier tracking flagged: copper prices up 8% this week."
> - Key metrics as subtle inline elements: "This week: 5 quotes sent, 4 approved clean, 1 adjusted"
> - A small sparkline showing weekly activity (subtle, not prominent)
>
> The card should feel like reading a short note from a colleague, not like looking at a KPI dashboard.
>
> Styling:
> - Slightly larger than other feed cards (it's the overview)
> - Warm background, generous padding (24px)
> - Text in body size (16px), with the conversational tone visible in the design — sentence case, natural language, no bullet points unless listing items
> - The sparkline and metrics are secondary — the narrative is primary

---

### Prompt 6: Process Detail View — Recurring Process

> Design a detail view for a recurring business process. The user clicks "Quoting" in the sidebar and sees how their quoting process is doing.
>
> Layout: Takes the centre panel of the three-panel workspace (the feed panel is replaced by this detail view).
>
> Content sections:
>
> 1. Header:
>    - Process name: "Quoting" (large, semibold)
>    - Status line: "Running since 6 weeks ago · 34 quotes completed"
>    - A subtle trust indicator: "You're checking everything" with a small link "Ready for less?"
>
> 2. "How it works" — plain language description of the process steps:
>    - "When a quote request comes in → I gather specs and pricing → draft the quote → you review → I send it"
>    - These steps are shown as a simple horizontal flow or vertical list with checkmarks/status, NOT as a complex DAG or flowchart
>    - Each step is one line, plain English
>
> 3. "How it's going" — performance narrative with inline data:
>    - "34 total · 31 approved clean · 3 corrected"
>    - A quality sparkline: ▁▂▃▅▇▇█▇▇█ with label "improving"
>    - "Average time: 12 minutes from request to draft"
>    - "Your corrections: mostly bathroom labour (3 of 3)"
>
> 4. "Recent" — last 3-5 items, compact list:
>    - "Henderson bathroom — $14,200 — awaiting review ●"
>    - "Wilson kitchen — $8,900 — sent, no response yet"
>    - "Peters hot water — $3,400 — approved and sent ✓"
>
> 5. "Under the hood" — collapsed by default, expandable:
>    - Shows: agent used, cost per run, routing logic, memory assembled
>    - This is for power users (Jordan) and developers (us). Most users never expand it.
>
> The trust control should feel like a conversation option, not a settings page:
> "You're currently checking every quote. Based on your track record (31 of 34 clean), you could check a sample instead. [Try it] [Not yet]"
>
> Overall feel: Like a project status page written by a colleague, not a monitoring dashboard.

---

### Prompt 7: Three-Panel Workspace Layout Shell

> Design the workspace layout that appears when an established user opens Ditto. This is the container that holds the sidebar, feed, and Self conversation panel.
>
> Layout (desktop, 1440px viewport):
> - LEFT: Sidebar navigation, 256px wide (w-64), slightly warmer background than the main area
> - CENTER: Feed/detail area, flex-1, scrollable. This is where feed cards or process detail views appear.
> - RIGHT: Self conversation panel, 320px wide (w-80), with the conversation surface and prompt input
>
> Between panels: subtle border (hsl(40 10% 90%)) or just background colour difference. No heavy dividers.
>
> Header: minimal. "Ditto" in the sidebar top-left. A view toggle (conversation / workspace) in the top-right area — subtle, not prominent. Maybe user avatar/initials far right (placeholder for future auth).
>
> The overall feel: Mercury's clean dashboard layout meets Claude.ai's warmth. Three panels coexist without feeling cramped. The centre panel is the primary focus area. The sidebar is quiet navigation. The Self panel is an always-available colleague.
>
> Show this populated with:
> - Sidebar: Rob's navigation (2 work items, 3 recurring processes)
> - Centre: The feed with a shift report card at top and 2 "needs your eye" cards below
> - Right: The Self panel with a brief conversation and the prompt input at the bottom
>
> Responsive variants to show:
> 1. Desktop (1440px) — full three-panel
> 2. Tablet (1024px) — sidebar collapses to icon rail (48px), Self panel becomes a slide-over drawer triggered by a button
> 3. Mobile (375px) — no sidebar, no Self panel. Full-screen feed OR full-screen conversation, with a bottom tab bar to switch between them

---

### Prompt 8: Feed Card — Mobile Variant (375px)

> Show the "Needs Your Eye" feed card (Prompt 2) at mobile width (375px).
>
> Changes from desktop:
> - Card takes full width (edge to edge with 16px page margin)
> - Action buttons stack vertically if they don't fit side by side
> - The Self's note still appears as a warm callout
> - All touch targets are minimum 44px height
> - Content summary may wrap to more lines — that's fine, don't truncate

---

## Part 3: Build Workflow

### For the Architect (Brief 039 update)

1. **Add acceptance criteria:** "Design tokens from visual identity spec are configured in Tailwind/shadcn theme BEFORE any component work begins."

2. **Add acceptance criteria:** "Hero components (conversation surface, feed card, prompt input, sidebar, shift report, process detail, workspace layout shell — Prompts 1-8) are designed visually and approved before Builder implements in code."

3. **Add acceptance criteria:** "Each component is screenshot-tested against reference UIs before marking complete."

### For the Builder

1. **Step 1:** Configure design tokens. Map visual identity spec tokens to shadcn/Tailwind variables. Verify contrast ratios. This is non-creative work — follow the spec exactly.

2. **Step 2:** Implement hero components from Subframe exports. The visual design is already decided — the Builder's job is faithful translation to React + engine integration.

3. **Step 3:** For non-hero components, Builder uses reference screenshots as context. Include a reference screenshot path in the prompt when asking AI to generate a component.

4. **Step 4:** After each component, screenshot it at desktop and mobile widths. Compare against reference. Iterate before moving to the next component.

### Quality Gates

| Gate | When | What |
|------|------|------|
| Token verification | After Step 1 | Contrast ratios pass WCAG AA. Colours render as intended. |
| Subframe fidelity | After Step 2 | Each hero component matches its Subframe design within reasonable tolerance. |
| Visual QA | After each component | Screenshot comparison against reference. Self-review: "Does this feel warm professional?" |
| Design review | Before merge | Designer (human) reviews the full UI in browser. Not just code review — visual review. |

---

## Part 4: What "Done" Looks Like

A new user opens Ditto. They see:

- A warm cream background — immediately different from every other SaaS tool
- The Self greets them — text that feels human, in a space that feels calm
- An input area that invites conversation — "What's on your mind?"
- No sidebar, no dashboard, no buttons, no features exposed
- Just a warm, spacious conversation with a competent colleague

That first-screen feeling — calm, warm, trustworthy, human — is the target. If it doesn't feel like that, we iterate until it does.

---

## Appendix: Reference URL Quick List

| # | Product | URL | Study for |
|---|---------|-----|-----------|
| 1 | Granola | granola.ai | Overall warm AI colleague feel |
| 2 | Intercom Fin | intercom.com/fin | Business conversation UI, structured content in chat |
| 3 | Mercury | mercury.com | Clean, trustworthy business dashboard |
| 4 | Gusto | gusto.com | Approachable business tool for non-technical users |
| 5 | Claude.ai | claude.ai | Cream background, artifact rendering, conversation warmth |
| 6 | WhatsApp Business | business.whatsapp.com | Rich cards in chat, Rob's mental model |
| 7 | Telegram bots | — | Inline keyboards, action buttons in context |
| 8 | Superhuman | superhuman.com | Premium quality bar, typography craft |
| 9 | Things 3 / Bear | things3.com / bear.app | Warm minimalism, micro-interactions |
| 10 | Calm | calm.com | Emotional design through colour |
