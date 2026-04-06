# DESIGN.md — Ditto Visual Identity & UI Design System

> Authoritative reference for any agent (human or AI) building UI. Every screen, component, and interaction must trace to this system.
>
> Format follows [Google Stitch DESIGN.md](https://stitch.withgoogle.com/docs/design-md/overview/).

---

## 1. Visual Theme & Atmosphere

Ditto is a **trusted advisor you meet through a conversation**, not a platform you sign up for. The visual identity must feel **simple, clean, and not scary**. Someone who clicks a link in an email from Alex should land on something that feels like continuing a conversation — not entering a software product.

**Mood:** Clean confidence. Professional but approachable. The kind of interface where you immediately know what to do, because there's only one thing to do: talk.

**Density:** Minimal. One thing at a time. The front door is a conversation. The workspace reveals itself when you need it, never before.

**Design philosophy:**
- **Simple over clever.** If someone's grandmother would find it confusing, simplify.
- **Clean over decorated.** White space is the design. The content is the interface.
- **One surface, progressive depth.** Front door and workspace share the same design language. Complexity appears gradually, not all at once.
- **Blocks over blobs.** Structured ContentBlocks, not walls of text (Insight-130: chat wrapper trap).
- **Desktop-primary, mobile-seamless.** Full workspace at the desk; decisions and captures flow naturally to mobile.

**What Ditto is NOT, visually:**
- Not a dark-mode developer tool
- Not a corporate enterprise dashboard
- Not a playful illustration-driven SaaS
- Not a chat wrapper with a logo on it
- Not a feature-marketing landing page (the front door is a conversation, not a pitch)

**Reference frame:** The cleanliness of processos.partners (shared design family). The conversational simplicity of Boardy.ai (front door is just "meet me and talk"). The premium feel of Superhuman (quality in the details, not the decorations).

---

## 2. Color Palette & Roles

The palette is clean, minimal, and anchored by **emerald green** — shared with the ProcessOS family (processos.partners). Green signals growth, trust, and go. Not the cold blue of enterprise software. Not the hot orange of consumer apps. Green is calm, alive, and professional.

### Primary Palette

| Name | Hex | Role |
|------|-----|------|
| **White** | `#FFFFFF` | Primary background. Clean, open, breathable. |
| **Surface** | `#F9FAFB` | Subtle background for sections, sidebar, alternate rows. |
| **Ink** | `#111317` | Primary text. Near-black. |
| **Secondary** | `#4A4A55` | Secondary text, descriptions, metadata. |
| **Tertiary** | `#65656F` | Placeholder text, disabled states, hints. |
| **Border** | `#E5E7EB` | Dividers, card borders, input borders. Clean gray. |
| **Border-light** | `#F3F4F6` | Subtle separators, hover backgrounds. |

### Accent: Emerald

The Ditto brand colour. Shared with processos.partners. Professional, alive, trustworthy.

| Name | Hex | Role |
|------|-----|------|
| **Emerald-700** | `#047857` | Dark accent for text-on-light, link text, active nav text. |
| **Emerald-600** | `#059669` | Primary accent. CTAs, buttons, active states. The brand green. |
| **Emerald-500** | `#10B981` | Lighter accent for badges, tags, secondary indicators. |
| **Emerald-100** | `#D1FAE5` | Light accent background. Selected states, success banners. |
| **Emerald-50** | `#ECFDF5` | Lightest wash. Highlight cards, target zones, toast backgrounds. |

### Semantic Colors

| Name | Hex | Role |
|------|-----|------|
| **Success** | `#059669` | Same as brand emerald. Approved, healthy, complete. |
| **Warning** | `#D97706` | Needs attention, pending review. Amber, not alarming. |
| **Error** | `#DC2626` | Failed states, rejected, critical issues. Used sparingly. |
| **Info** | `#2563EB` | Informational only. Links in body text. Very sparingly. |

### Dark Mode

Dark mode inverts the luminance hierarchy. The emerald accent stays vibrant.

| Name | Light | Dark |
|------|-------|------|
| White | `#FFFFFF` | `#111317` |
| Surface | `#F9FAFB` | `#1A1D23` |
| Ink | `#111317` | `#F9FAFB` |
| Secondary | `#4A4A55` | `#A1A1AA` |
| Border | `#E5E7EB` | `#2D3039` |
| Emerald-600 | `#059669` | `#10B981` |
| Emerald-50 | `#ECFDF5` | `rgba(5,150,105,0.08)` |

---

## 3. Typography Rules

### Font Stack

One font family. Clean and consistent. No serif distinction — simplicity is the brand.

| Role | Font | Fallbacks | Why |
|------|------|-----------|-----|
| **All UI** | **Inter** | system-ui, -apple-system, sans-serif | Clean, readable at every size. OpenType features `"cv01", "ss03"`. Same as processos.partners. |
| **Mono** | **Geist Mono** | ui-monospace, SF Mono, Menlo, monospace | Technical content, code, metadata values. Same as processos.partners. |

### Type Scale

| Level | Size | Weight | Line-height | Letter-spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| **Display** | clamp(2rem, 4vw, 3rem) | 700 | 1.1 | -0.025em | Hero text, front door greeting. Rare — one per page max. |
| **H1** | 28px / 1.75rem | 700 | 1.25 | -0.02em | Page titles, section headers |
| **H2** | 22px / 1.375rem | 600 | 1.3 | -0.01em | Card headers, composition titles |
| **H3** | 18px / 1.125rem | 600 | 1.35 | 0 | Sub-headers, group labels |
| **Body** | 15px / 0.9375rem | 400 | 1.6 | 0 | Default text, conversation, descriptions |
| **Body-medium** | 15px / 0.9375rem | 500 | 1.6 | 0 | Emphasis within body text |
| **Small** | 13px / 0.8125rem | 400 | 1.5 | 0.01em | Metadata, timestamps, helper text |
| **Caption** | 11px / 0.6875rem | 500 | 1.4 | 0.04em | Badges, labels, overlines. Uppercase. |
| **Mono** | 13px / 0.8125rem | 400 | 1.5 | 0 | Code, IDs, technical values |

### Typography Rules

1. **Max 3 hierarchy levels per screen.** Display + Body + Small is enough. If you need more, the screen is too complex.
2. **65ch max line width.** Use `max-width: 42rem` on text containers.
3. **Weight does the work, not size.** Use 600/700 for emphasis. Don't make things bigger to make them important.
4. **Tight letter-spacing on headings.** Negative tracking at large sizes creates authority. Body stays at 0.

---

## 4. Component Stylings

### Buttons

| Variant | Background | Text | Border | Radius | Padding | Usage |
|---------|-----------|------|--------|--------|---------|-------|
| **Primary** | Emerald-600 | White | none | 8px | 16px 18px | Single primary action per view. "Message," "Send," "Approve." |
| **Secondary** | White | Ink | 1px Border | 8px | 16px 18px | Supporting actions. "Edit," "View details," "Cancel." |
| **Ghost** | transparent | Secondary | none | 8px | 16px 14px | Tertiary. Navigation, "Back," minor actions. |
| **Destructive** | transparent | Error | 1px Error/30% | 8px | 16px 18px | "Reject," "Remove." Never filled red. |
| **Approval** | Emerald-600 | White | none | 8px | 16px 18px | Trust gate approvals. Same style as primary (approval IS the primary action). |

**States:** Hover darkens background 10%. Active darkens 15%. Disabled at 40% opacity. Transition: `150ms ease`.

**Rule:** One primary (green) button per visible area. Two green buttons = confusing. Boardy pattern: green = the one thing to do next.

### Cards (ContentBlocks)

All content renders through cards. The fundamental UI primitive.

```
┌─────────────────────────────────────────┐
│  [Icon/Badge]  Title              [Meta]│
│─────────────────────────────────────────│
│                                         │
│  Content area — structured, scannable   │
│                                         │
│  [Action]              [Secondary]      │
└─────────────────────────────────────────┘
```

| Property | Value |
|----------|-------|
| Background | White (`#FFFFFF`) |
| Border | 1px Border (`#E5E7EB`) |
| Border-radius | 12px |
| Padding | 20px |
| Shadow | none by default. `0 1px 3px rgba(0,0,0,0.05)` on hover. |
| Spacing between cards | 12px |

**Card variants by block type:**

| Block Type | Visual distinction |
|-----------|-------------------|
| StatusCardBlock | Left 4px border, colored by status (Emerald/Warning/Error) |
| ReviewCardBlock | Left 4px Warning border. "Needs review" badge. |
| MetricBlock | Large number (H1 size), sparkline below |
| SuggestionBlock | Emerald-50 background. Inviting, lighter. |
| AlertBlock | Warning or Error left border. Icon prefix. |
| ChecklistBlock | Checkbox rows. Progress in header. |
| ProcessProposalBlock | Emerald-50 background. Numbered step circles. |
| ArtifactBlock | Compact card. "Open" button. |
| RecordBlock | Field-value table layout. Person cards, process details. |
| ProgressBlock | Step timeline with current indicator. |

### Badges & Status

| Type | Style |
|------|-------|
| **Trust tier** | Pill. Supervised (Warning bg), Spot-checked (Emerald-50 bg), Autonomous (Emerald-100 bg), Critical (Error bg, white text) |
| **Status dot** | 8px circle. Running (pulsing Emerald), Paused (Warning), Complete (Emerald check), Failed (Error x) |
| **Mode** | Text label in Small, uppercase. No pill needed. |
| **Persona** | "Alex" / "Mira" in Small weight-500. |

### Input Fields

| Property | Value |
|----------|-------|
| Background | White |
| Border | 1px Border, 2px Emerald-600 on focus |
| Border-radius | 8px |
| Padding | 12px 16px |
| Font | Body (15px Inter) |
| Placeholder | Tertiary color |
| Label | Small (13px), Secondary, above the field |

### Prompt Input (Conversation)

**Rounded rectangle, never pill.** 16px radius.

| Property | Value |
|----------|-------|
| Border-radius | 16px |
| Min-height | 48px, grows to ~200px max |
| Background | White |
| Border | 1px Border, 2px Emerald-600 on focus |
| Padding | 14px 16px |
| Send button | Emerald-600 circle, 32px, arrow icon. Disabled until text present. |
| Placeholder (workspace) | "Talk to Ditto..." in Tertiary |
| Placeholder (front door) | "Ask me anything, or tell me what you need" in Tertiary |

### Navigation (Sidebar)

| Property | Value |
|----------|-------|
| Width | 256px, collapses to 48px icon rail at medium breakpoint |
| Background | Surface (`#F9FAFB`) |
| Border-right | 1px Border |
| Item height | 40px |
| Active item | Emerald-50 background, Emerald-700 text, 3px left border Emerald-600 |
| Hover | Border-light background |
| Section labels | Caption, uppercase, Tertiary |
| Icons | 20px, Tertiary default, Emerald-700 active. Line style. |

---

## 5. Layout Principles

### Spacing Scale (4px grid)

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Badge padding, icon gaps |
| `space-2` | 8px | Within cards, compact spacing |
| `space-3` | 12px | Between cards, list items |
| `space-4` | 16px | Section padding, mobile card padding |
| `space-5` | 20px | Card padding, section margins |
| `space-6` | 24px | Between sections |
| `space-8` | 32px | Major sections, panel top padding |
| `space-10` | 40px | Page-level vertical rhythm |
| `space-16` | 64px | Hero sections, major layout divisions |

### The Front Door Layout

The front door is a **single centered column**. No sidebar, no panels, no navigation. Just Ditto.

```
┌──────────────────────────────────────────────┐
│                                              │
│              ditto                           │  ← Wordmark, top-center or top-left
│                                              │
│                                              │
│         ┌──────────────────────┐             │
│         │                      │             │
│         │   "Hi, I'm Alex      │             │  ← Conversation area, centered
│         │    from Ditto."       │             │     max-width: 640px
│         │                      │             │
│         │   [Message]           │             │  ← Single green CTA
│         │                      │             │
│         └──────────────────────┘             │
│                                              │
│                                              │
└──────────────────────────────────────────────┘
```

- White background. No patterns, no gradients, no decorative elements.
- Centered conversation area, max-width 640px (multi-turn conversation needs breathing room).
- One green button: "Message" or "Talk to Ditto."
- The page IS the conversation. Click the button, start talking.
- Minimal footer: "from Ditto" + privacy link + opt-out link.

This is the Boardy pattern applied with Ditto's character: simple, not scary, clean.

### Workspace Layout (Progressive Reveal)

When a user has processes and needs the full workspace, the layout expands:

```
┌──────────┬─────────────────────────────────┬──────────┐
│          │                                 │          │
│ Sidebar  │       Center Column             │  Right   │
│  w-64    │  (conversation + blocks)        │  Panel   │
│          │                                 │  w-72    │
│          │  max-width: 720px content       │          │
│          │                                 │          │
│          │  ┌─────────────────────────┐    │          │
│          │  │  Feed / Blocks          │    │          │
│          │  ├─────────────────────────┤    │          │
│          │  │  Prompt Input           │    │          │
│          │  └─────────────────────────┘    │          │
│          │                                 │          │
└──────────┴─────────────────────────────────┴──────────┘
```

| Panel | Width | Behavior |
|-------|-------|----------|
| Sidebar | 256px | Collapses to 48px icon rail at 1024-1279px. Hamburger below 1024px. |
| Center | Fluid, content max 720px | Conversation + blocks. Centered. Spatially fixed — never moves between modes. |
| Right panel | 288px | Collapsible. Context-adaptive. Must not disappear between modes. |

**The transition:** Front door (single column) → workspace (three panel) happens when the user's relationship with Ditto grows to need it. Same colors, same components, same type. Just more space.

### Content Width

| Context | Max-width |
|---------|-----------|
| Front door conversation | 640px |
| Conversation messages | 720px |
| Artifact mode | 720px |
| Cards in feed | 100% of center column |

---

## 6. Depth & Elevation

Minimal. The interface is mostly flat. Cards are distinguished by borders, not shadows.

| Level | Shadow | Usage |
|-------|--------|-------|
| **0** | none | Default. Most surfaces. |
| **1** | `0 1px 3px rgba(0,0,0,0.05)` | Hovered cards, focused inputs. |
| **2** | `0 4px 12px rgba(0,0,0,0.08)` | Dropdowns, popovers, tooltips. |
| **3** | `0 8px 24px rgba(0,0,0,0.12)` | Modals, mobile bottom sheet. |

**Rules:**
- Cards at rest have border only, no shadow. Shadow appears on hover.
- Never combine heavy shadow with visible border.
- Mobile bottom sheets: Level 3 + 16px top radius.

---

## 7. Do's and Don'ts

### DO

- **Keep it simple.** If someone new would hesitate, remove something.
- **Use blocks, not text walls.** Every structured thing (metric, status, person, suggestion) gets its own ContentBlock.
- **Use the accent sparingly.** Emerald appears on the primary CTA, active nav, focused inputs. Not everywhere.
- **Show trust visually.** Trust badges, health dots, confidence indicators — at a glance.
- **Use structured layouts inside cards.** Field-value pairs, checklists, metric rows.
- **Progressive disclosure.** Summary first, detail on click.
- **Treat empty states as conversation starters.** Not "no data" — Ditto saying "Let's get started."

### DON'T

- **Don't build a landing page.** The front door is a conversation, not a pitch deck.
- **Don't wrap AI text in a chat bubble and call it done.** Insight-130: block-based, not text-based.
- **Don't use illustrations, mascots, or decorative graphics.** No hedgehogs, no blobs, no abstract shapes.
- **Don't use gradients on surfaces.** Clean flat colors only.
- **Don't use pill shapes for multi-line inputs.** 16px radius max.
- **Don't move the chat between modes.** Center column is spatially fixed.
- **Don't hide the right panel.** It adapts but doesn't disappear.
- **Don't add decorative animations.** Motion is functional only.
- **Don't make it scary.** No feature overload, no dashboard density, no "power user" complexity on first view. One thing at a time.

---

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Layout |
|------|-------|--------|
| **Desktop-wide** | >=1280px | Full three-panel workspace |
| **Desktop** | 1024-1279px | Icon rail sidebar + center + right panel |
| **Tablet** | 768-1023px | Single column. Right panel as bottom sheet. |
| **Mobile** | <768px | Full-width conversation. Bottom sheet for reviews. |

### Mobile Patterns

| Pattern | Behavior |
|---------|----------|
| **Front door** | Centered card, full-width padding. Same as desktop but tighter. |
| **Conversation** | Full-width. Prompt pinned to bottom. |
| **Artifact review** | Bottom sheet, swipe-to-dismiss. |
| **Approval** | Sticky bottom bar: Approve / Edit / Reject. |
| **Navigation** | Hamburger -> full-screen overlay. |

### Touch Targets

- 44px minimum on all interactive elements
- 48px minimum row height in lists
- 8px minimum between tappable items

---

## 9. Agent Prompt Guide

### Quick Reference

```
Background:       #FFFFFF (white)
Surface:          #F9FAFB
Card border:      1px solid #E5E7EB
Card radius:      12px
Card shadow:      none (hover: 0 1px 3px rgba(0,0,0,0.05))

Primary text:     #111317 (ink)
Secondary text:   #4A4A55
Tertiary text:    #65656F
Accent:           #059669 (emerald-600)
Accent dark:      #047857 (emerald-700)
Accent light bg:  #ECFDF5 (emerald-50)
Accent medium bg: #D1FAE5 (emerald-100)

Success:          #059669
Warning:          #D97706
Error:            #DC2626

Font:             "Inter", system-ui, sans-serif
Mono:             "Geist Mono", ui-monospace, monospace

Body size:        15px, line-height 1.6
H1:               28px / 700
H2:               22px / 600
H3:               18px / 600

Button radius:    8px
Input radius:     8px
Prompt radius:    16px
Card radius:      12px

Spacing unit:     4px (multiples: 8, 12, 16, 20, 24, 32)
Content max-width: 720px (workspace), 640px (front door conversation)
```

### Ready-to-Use Prompts

**"Build the front door":**
> White page, 960px max-width, centered. Nav bar: "ditto" wordmark (Inter 20px 700, #059669) left, "Sign in" link right. Hero section: display headline (clamp 2-3rem, 700, #111317, centered), one-line subhead (15px, #4A4A55), one green CTA button (#059669, white text, 8px radius, 16px 18px padding). Below: "How it works" as 2-3 cards side by side (12px radius, 1px #E5E7EB border, 20px padding, Lucide icon + short headline + one line of text). Below: trust message as 3 short statements in a row. Bottom: repeat CTA. Footer: "from Ditto" in 13px #65656F. Generous spacing (64px between sections). No illustrations, no product screenshots, no gradients. Simple, clean, not scary.

**"Build a card component":**
> White background, 1px #E5E7EB border, 12px radius, 20px padding. No shadow at rest. Header in Inter 18px 600. Body in Inter 15px 400. Optional 4px left border for status coloring. Hover: subtle shadow (0 1px 3px rgba(0,0,0,0.05)).

**"Build a conversation message":**
> 720px max-width, left-aligned. Content is structured blocks, not raw text. Each block renders as its own card inline. Text between blocks in Inter 15px, line-height 1.6.

**"Build the sidebar":**
> 256px wide, #F9FAFB background, 1px right border #E5E7EB. Items 40px tall. Active: #ECFDF5 background, #047857 text, 3px left accent #059669. Sections: uppercase 11px #65656F labels. Icons: 20px Lucide, line style.

---

## 10. Web Pages & Surfaces

One design language across every page. Same colors, same type, same components. The front door web pages are defined in **Sub-brief 085** — this section is the design specification that 085 defers to.

### Page Map

| Page | URL | Purpose | Audience |
|------|-----|---------|----------|
| **Home** | `/` | Front door. Meet Ditto, understand what it is, start a conversation. | Everyone — network participants, visitors, prospects. |
| **About** | `/about` | Who Ditto is. The institution, the values, the team behind it. | People who want to know more before engaging. |
| **How It Works** | `/how-it-works` | The two value props explained simply. Step-by-step clarity. | People who clicked from an email or heard about Ditto and want to understand. |
| **Chief of Staff** | `/chief-of-staff` | The workspace value prop. The antidote to AI slop. What makes Ditto different from ChatGPT/OpenClaw. | SMB owners, operators, team managers (Rob, Lisa, Jordan, Nadia). |
| **Network** | `/network` | The super-connector value prop. How Alex/Mira work. Relationship-first, not volume-first. | Founders, connectors, anyone who needs introductions or sales. |
| **Verify** | `/verify` | Anti-phishing verification for outreach recipients. Trust bridge + acquisition channel. | Outreach recipients checking if Alex's email is genuine. |
| **Referred** | `/welcome/referred` | Recipient-to-user conversion. Contextual Alex greeting for people who experienced the product. | Outreach/introduction recipients who want their own advisor. |
| **Sign In** | `/login` | Existing user entry to workspace. | Active users, workspace users. |

All pages share: nav bar, footer, design tokens, responsive breakpoints. No page should feel like a different product.

---

### Shared Navigation

```
┌──────────────────────────────────────────────────────┐
│  ditto          About  How It Works        [Sign in] │
└──────────────────────────────────────────────────────┘
```

- Wordmark left: "ditto" in Inter 20px 700, Emerald-600.
- Nav links center-right: Inter 15px 500, Ink color, no underline. Hover: Emerald-700.
- Sign in: Ghost button style, right-aligned.
- Mobile: hamburger menu.
- Sticky on scroll with subtle bottom border (Border color).

### Shared Footer

```
┌──────────────────────────────────────────────────────┐
│  ditto                                               │
│  The AI that remembers and improves.                 │
│                                                      │
│  Product          Company         Legal              │
│  How It Works     About           Privacy            │
│  Chief of Staff   Contact         Terms              │
│  Network                                             │
│                                                      │
│  © 2026 Ditto                                        │
└──────────────────────────────────────────────────────┘
```

- Surface background (`#F9FAFB`). 1px top Border.
- Three columns on desktop, stacked on mobile.
- Inter 13px. Secondary color for links, Emerald-700 on hover.

---

### Page 1: Home (`/`)

The front door. **Conversation IS the hero** — not a landing page with a CTA that opens a conversation. The Formless.ai pattern: the page IS the interaction. Visitors talk to Alex directly.

```
┌──────────────────────────────────────────────────────┐
│  [Nav]                                               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  CONVERSATION (vertically centered on load)          │
│  max-width: 640px, centered                          │
│                                                      │
│  Alex: "Hey, I'm Alex from Ditto."                   │
│  Alex: "I connect people who should know each other." │
│                                                      │
│  ┌──────────────────────────────────────────┐        │
│  │ Ask me anything, or tell me what you need │        │
│  └──────────────────────────────────────────┘        │
│  [Who do you work with?] [How does this work?]       │
│  [I need to grow my network]                         │
│                                                      │
│  User types → Alex responds → natural conversation   │
│  → Alex asks for email → email capture transition    │
│  → post-submission enrichment + timeline             │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  TWO VALUE PROPS — below the fold, for scrollers     │
│                                                      │
│  ┌─────────────────┐  ┌─────────────────┐           │
│  │ Super-Connector  │  │ Chief of Staff  │           │
│  │ Icon + 3 lines   │  │ Icon + 3 lines  │           │
│  │ [Learn more →]   │  │ [Learn more →]  │           │
│  └─────────────────┘  └─────────────────┘           │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  TRUST — three short statements in a row             │
│  "Remembers everything."                             │
│  "Earns your trust."                                 │
│  "No spam, ever."                                    │
│                                                      │
├──────────────────────────────────────────────────────┤
│  [Footer]                                            │
└──────────────────────────────────────────────────────┘
```

---

### Page 2: About (`/about`)

Who Ditto is. Not a feature page — a character page.

**Content:**
- What Ditto is: a trusted advisor and super-connector. An institution with faces (Alex, Mira). Not a chatbot, not a dashboard, not AI slop.
- The values: candour over comfort, reputation is the product, earned trust not assumed trust, no spam ever, the human decides. (Drawn from the character bible — stated simply, not as a manifesto.)
- The team / company behind Ditto. Brief, credible, human.
- Where Ditto fits: the LaunchPath Ventures / ProcessOS ecosystem context if relevant.

**Layout:** Single column, max-width 720px, generous spacing. Text-led with good typography. No cards grid — this is a reading page. Could include a simple quote-style callout for the core positioning statement.

---

### Page 3: How It Works (`/how-it-works`)

Step-by-step clarity on what happens when you use Ditto. Both value props explained in plain terms.

**Content structure:**

**Section A: "Ditto as your network"**
1. You tell Ditto who you want to meet (or who you want to reach)
2. Alex or Mira researches and drafts outreach on your behalf
3. You review and approve before anything is sent
4. Ditto follows up, books meetings, nurtures relationships
5. Your network compounds over time — Ditto remembers everyone

**Section B: "Ditto as your chief of staff"**
1. You describe a process you want handled (quoting, content, reports)
2. Ditto builds it through conversation — no workflow diagrams
3. Every output starts supervised — you review everything
4. As Ditto proves reliable, you check less. Trust is earned.
5. Corrections stick. The process improves. You get your time back.

**Layout:** Two sections, each with 3-5 numbered steps. Clean cards or numbered list with icon per step. Could be vertical timeline or horizontal step cards. Simple, scannable.

---

### Page 4: Chief of Staff (`/chief-of-staff`)

The workspace value prop page. This is where Ditto differentiates from generic AI chat.

**The positioning:** The antidote to OpenClaw and generalised AI slop you can't trust.

**Content:**
- **The problem:** AI chat is unreliable. Every conversation starts from scratch. Nothing learns, nothing sticks. You can't delegate because you can't trust the output.
- **The Ditto difference:** Processes are durable — defined once, improved through use. Trust is earned — starts supervised, earns autonomy. Corrections compound — teach once, fixed forever. Visible oversight — harness checks, confidence scores, evidence trails.
- **Who it's for:** Business owners drowning in operations (Rob). E-commerce managers reactive instead of strategic (Lisa). Tech generalists with 20 automation ideas and no capacity (Jordan). Team managers reviewing the same corrections every week (Nadia).
- **What it looks like:** Daily briefings, review queues, process health, trust controls. The workspace. (Described in text — no product screenshots until they're real.)

**Layout:** Alternating sections — problem statement, solution, who it's for. Max-width 720px. Cards for the persona summaries. Text for the positioning.

---

### Page 5: Network (`/network`)

The super-connector value prop page. How Alex and Mira work.

**Content:**
- **The problem:** AI SDRs send 500 generic emails. 70% churn in 3 months. Volume-first doesn't work.
- **Ditto's approach:** 5 great emails a week, not 500 generic ones. Named intermediary (Alex/Mira) with a real reputation. Relationship-first. Will refuse to send outreach it doesn't believe will be welcomed.
- **Two modes:** Selling (Ditto as your BDR — proactive within the plan) and Connecting (Ditto as researcher/advisor — finds people, you decide on intros).
- **Trust built in:** Every outreach reviewed until Ditto earns your trust. Introductions always approved. No spam, ever.

**Layout:** Similar to Chief of Staff page. Problem → approach → modes → trust. Clean sections, max-width 720px.

---

### Design Rules for All Pages

- Max-width 960px for full-width sections, 720px for text content. Centered.
- 64px (space-16) between major sections.
- Hero sections use Display type. Everything else uses H1/H2/Body.
- One green CTA per viewport. Never two green buttons competing.
- No product screenshots until they exist and are polished.
- No illustrations, mascots, or abstract graphics. Type and space do the work.
- No "trusted by X companies" or social proof sections until they're real.
- Mobile: everything stacks vertically. Same content, same order, same quality.

---

### Surface: Active User View

**Who sees this:** Active users checking on outreach, connections, approvals (logged in).

**What it is:** Single-column conversation with status cards. No sidebar. Prompt input at bottom.

**Design:** White page, 720px max-width, conversation thread with ContentBlocks showing progress. "Talk to Ditto..." prompt at bottom. Header with Ditto wordmark and user identifier.

### Surface: Full Workspace

**Who sees this:** Workspace users (Rob, Lisa, Jordan, Nadia) managing processes (logged in).

**What it is:** Three-panel layout with sidebar, conversation center, and context panel. The chief of staff experience — daily briefings, review queues, process health, trust controls. Everything OpenClaw and generic AI chat can't do.

### The Reveal Principle

Front door pages -> active user view -> full workspace. Same design system. Complexity grows with the relationship. **The product grows to match the user, never the reverse.**

---

## 11. Motion & Transitions

All motion is functional. Nothing decorative.

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Button hover | 150ms | ease |
| Card hover | 200ms | ease-out |
| Panel open/close | 250ms | ease-in-out |
| Bottom sheet | 300ms | cubic-bezier(0.32, 0.72, 0, 1) |
| Page transition | 200ms | ease |
| Block appear | 200ms | ease-out, opacity + translateY(8px) |
| Skeleton loading | 1.5s | linear loop |

No bounce. No spring physics. No entrance animations on page load. Loading = skeleton shimmer, not spinners.

---

## 12. Iconography & Logo

### Icons

| Property | Value |
|----------|-------|
| Style | Line, 1.5px stroke. Never filled. |
| Size | 20px default, 16px compact, 24px headers |
| Color | Tertiary default, Emerald-700 active |
| Library | Lucide |

No emoji. Icons accompany labels, never replace them (except collapsed sidebar).

### Logo

**Wordmark:** "ditto" in Inter, lowercase, weight-700, Emerald-600 (`#059669`).

**Mark:** The letter "d" in Inter 700, Emerald-600, in a 32px circle of Emerald-50. Favicon, app icon, collapsed sidebar.

No tagline. No gradient. No 3D. Simple, clean, confident.
