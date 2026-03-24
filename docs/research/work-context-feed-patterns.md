# Research Report: Work-Context Feed UX Patterns

**Date:** 2026-03-23
**Research question:** How do existing products surface work context as a feed? What UX mechanics, AI enrichment patterns, and rendering architectures make feeds effective for work (not social media)?
**Triggered by:** Ditto workspace design — the primary surface needs a feed that builds context about what's happening across processes, agents, and outcomes.
**Consumers:** Dev Designer (Layer 6 feed design), Dev Architect (ADR-009 feed rendering, output architecture), Phase 10 MVP

---

## Context

Ditto's work surface is not a dashboard of widgets or a chat thread — it's a living workspace where processes manifest as outcomes (Insight-067). A core question: how should the user build context about what's happening? A feed is the natural answer, but "feed" means many things. This report surveys work-context feeds (not social media), AI-enriched feeds, and the rendering architectures behind them.

---

## 1. Work-Context Feed Products

### 1.1 GitHub Dashboard & Activity Feed

**Source:** [GitHub Changelog — Dashboard refresh (Sep 2025)](https://github.blog/changelog/2025-09-04-the-dashboard-feed-page-gets-a-refreshed-faster-experience/), [Home dashboard update (Oct 2025)](https://github.blog/changelog/2025-10-28-home-dashboard-update-in-public-preview/)

GitHub recently split its home surface into two distinct views:

- **Home Dashboard** — short, customizable module lists: recent agent tasks, pull requests, issues. Each module has filtering options. This is a *glanceable status board*.
- **Feed (github.com/feed)** — chronological event stream from repos, PRs, issues, releases, stars. Newest-first. No filtering controls (unlike the old "For you" feed). This is a *raw activity stream*.

**Key patterns:**
- Separation of *status board* (what matters now) from *activity stream* (what happened)
- Agent task module — GitHub now surfaces AI agent work alongside human work in the same dashboard
- Chronological ordering for the feed; relevance/recency for the dashboard modules
- Event types are heterogeneous: PR opened, issue commented, release published, repo starred — all in one stream

**Ditto relevance:** The dashboard/feed split maps to Ditto's need for both a "what needs attention" surface and a "what happened" stream. The agent task module is directly relevant — Ditto surfaces process steps completed by agents alongside human actions.

---

### 1.2 Linear Inbox + Pulse

**Source:** [Linear Inbox Docs](https://linear.app/docs/inbox), [Linear Pulse launch (Apr 2025)](https://linear.app/changelog/2025-04-16-pulse), [UI Refresh (Mar 2026)](https://linear.app/changelog/2026-03-12-ui-refresh)

Linear's notification center has two layers:

**Inbox** — notification feed for subscribed issues. Auto-subscribed when you create, are assigned, or are mentioned. Cannot customize *which* notifications appear (all do), but can filter by type and by actor (including filtering by agent vs. human). Keyboard shortcuts for mark-read, snooze. Recent redesign emphasizes notification type and teammate faces, with simplified headers and filters.

**Pulse** — AI-generated personalized summary delivered daily or weekly to the Inbox. Can be read as text or listened to as an audio digest. Available on all plans. Extends Linear as "source of truth for your product organization."

**Key patterns:**
- Inbox is actor-centric (who did what), Pulse is narrative-centric (what happened, synthesized)
- Pulse is a *shift report* — it summarizes what changed since you last looked
- Audio digest for mobile/commute consumption
- Collapsed issue history groups similar consecutive events to reduce noise
- Filter by agent vs. human actor — critical for AI-heavy workflows

**Ditto relevance:** Pulse is the closest existing product to Ditto's "quiet shift report" concept. The actor filter (agent/human) is essential for Ditto. The inbox-as-notification-center + pulse-as-AI-summary is a two-layer pattern Ditto should adopt.

---

### 1.3 Slack Activity Hub

**Source:** [Slack UI redesign](https://diginomica.com/slack-updates-ui-more-focus-simplify-navigation), [Slack feature drops Dec 2025](https://slack.com/blog/news/feature-drop-dec25)

Slack redesigned its Activity tab into an Activity Hub:

- Consolidates mentions, reactions, app notifications, channel invitations, DMs into a single feed
- App notifications are grouped together to reduce clutter
- "Peek" feature — see notification content without switching context (progressive disclosure)
- Customizable density options and triage tools: filtering, sorting, bulk actions
- Flexible page design supporting side-by-side views

**Key patterns:**
- Grouping by source type (app notifications clustered)
- Peek for progressive disclosure — don't force full context switch
- Bulk triage actions (mark all read, dismiss group)
- Side-by-side: feed + detail pane simultaneously

**Ditto relevance:** The peek pattern is directly applicable — a feed item should expand to show detail without navigating away. Grouping app/agent notifications separately from human ones matches Ditto's trust-tier model.

---

### 1.4 Notion Updates / Inbox

**Source:** [Notion Help — Inbox & Notifications](https://www.notion.com/help/updates-and-notifications)

Notion's Inbox sits at the top of the sidebar:

- Updates organized by page and by comment thread — all updates for a specific page grouped together
- Triggers: @-mentions, comment replies, person property assignments, reminders, page invitations
- Filter by: unread/read, unread only, archived, all workspace updates
- Mobile: swipe actions to manage (archive, mark read)

**Key patterns:**
- Grouping by entity (page) rather than by time — related updates cluster
- Comment-thread grouping within a page
- Swipe gestures on mobile for quick triage
- Minimal set of triggers (not everything generates a notification)

**Ditto relevance:** Grouping by entity (process, in Ditto's case) is powerful — all updates about a process cluster together rather than scattering chronologically. The selective trigger model avoids notification fatigue.

---

### 1.5 Asana Inbox

**Source:** [Asana Inbox Guide](https://asana.com/guide/get-started/try/inbox-notifications), [Asana Inbox Features](https://asana.com/features/project-management/inbox)

Asana's Inbox is the "landing strip" for activity:

- New messages, work assignments, team activity, status reports
- Filter by: specific people, tasks assigned to you, @mentions
- Actions: reply to comments, create follow-up tasks, bookmark, archive — all inline without navigating away
- Do Not Disturb with scheduled quiet hours
- Customizable notification timing (certain times of day, days of week)

**Key patterns:**
- Inline actions: reply, create follow-up task, bookmark, archive — all without leaving the feed
- Scheduled notification delivery (batching by time)
- Follow-up task creation from a feed item — feed is an action surface, not just information

**Ditto relevance:** Inline action creation (create follow-up task from feed item) is essential for Ditto. A process update that says "review needed" should allow the user to approve/reject/comment right from the feed card. Scheduled delivery maps to Ditto's "quiet oversight" philosophy.

---

### 1.6 Monday.com Update Feed

**Source:** [Monday.com Update Feed](https://support.monday.com/hc/en-us/articles/115005309885-The-Update-Feed-Inbox)

Monday.com's Update Feed:

- Shows updates from boards and items the user is subscribed to, plus direct @mentions
- Four notification tabs: All, Unread, I was mentioned, Assigned to me
- Pin important updates to top of feed (sticky)
- Bookmark important posts for later retrieval
- Red badge counter on bell icon for unread count
- Unread items highlighted in blue until explicitly marked read

**Key patterns:**
- Tab-based filtering (All / Unread / Mentioned / Assigned) — simple, predictable categories
- Pinning and bookmarking — user can curate their own priority within the feed
- Visual indicators: blue highlight for unread, red badge for count

**Ditto relevance:** Pin/bookmark pattern is useful for Ditto — a user might want to pin a critical process update to the top of their feed while they work on it. Tab-based filtering (All / Needs attention / Agent updates / Human updates) could map directly.

---

### 1.7 Superhuman Split Inbox

**Source:** [Superhuman Split Inbox](https://blog.superhuman.com/how-to-split-your-inbox-in-superhuman/), [Superhuman AI Email](https://blog.superhuman.com/the-best-ai-email-management-tool/)

Superhuman's Split Inbox is the most refined triage-oriented feed:

- Splits inbox into intentional sections: "Important" (person-to-person, high-priority) vs. "Other" (mailing lists, automated, marketing)
- AI analyzes communication patterns, sender relationships, content urgency
- Auto Summarize: one-line summaries of complex email threads for rapid context
- Sub-50ms interaction targets (10-30ms typical) — everything feels instantaneous
- Keyboard-first architecture: every action without mouse
- Removed all visual clutter, decorative elements, animations that interrupt focus

**Key patterns:**
- AI-driven split: system classifies items into priority tiers automatically
- One-line auto-summary per item — don't make the user read to understand
- Extreme performance focus — sub-50ms interactions
- Keyboard-first for power users; minimal visual noise

**Ditto relevance:** AI-driven priority splitting is exactly what Ditto needs. Process updates, agent outputs, and system insights should be classified by urgency/attention-needed. Auto-summary per feed item is essential when AI agents produce verbose outputs. The performance bar (sub-50ms) is aspirational for the Ditto work surface.

---

### 1.8 Apple News & Google Discover

**Source:** [Apple News customization](https://appleinsider.com/inside/apple-news/tips/inside-apple-news---how-to-get-the-most-out-of-your-curated-news-sports-puzzles-feed), [Google Discover architecture](https://searchengineland.com/google-discover-qualifies-ranks-filters-content-research-470190)

**Apple News:**
- Hybrid curation: human editors for "Top Stories," ML algorithm for "Trending Stories"
- Personalization via reading history, Siri searches, topic follows
- "Suggest More" / "Suggest Less" feedback controls
- Channel follow/block for coarse control

**Google Discover:**
- Card-based feed with large images, headlines, publisher info, dates
- Personalization from browsing history, location, app usage, YouTube, Chrome
- pCTR (predicted click-through rate) model for relevance scoring per user session
- 150+ concurrent server-side experiments affecting card display
- Real-time recalculation per session — not a static feed
- "Discover more" option per card for topic drill-down

**Key patterns:**
- Hybrid human + algorithmic curation (Apple News)
- Continuous personalization via implicit signals (reading time, clicks) + explicit signals (follow, block, suggest more/less)
- Card-based layout with large visual anchors
- Per-session relevance recalculation (Google)
- Topic drill-down from individual cards

**Ditto relevance:** The hybrid curation model maps to Ditto's need for both system-generated items (process updates, agent outputs) and user-configured priorities. Implicit learning from what the user engages with can tune feed ordering over time. The "Suggest More/Less" pattern is a lightweight feedback mechanism for feed personalization.

---

### 1.9 Artifact (AI News App, now defunct)

**Source:** [UX of Artifact (UX Collective)](https://uxdesign.cc/the-ux-of-artifact-c15726cb58b8), [Artifact homepage redesign](https://medium.com/artifact-news/our-new-artifact-homepage-c3e3a8cfecae)

Artifact (Instagram co-founders, Jan 2023 - Jan 2024) pioneered several AI feed patterns:

- TikTok-style "For You" algorithm adapted to news: reading history drives personalization
- User control + transparency: see what the system knows about you, fine-tune it
- AI rewrites clickbait headlines flagged by users (collaborative AI + human curation)
- "Get out of the way" design philosophy — content is the star, not the app chrome
- Rich interconnected animations, 3D renders, Lottie animations, interactive effects
- Dark theme, high contrast, bold visual design

**Key patterns:**
- Transparent personalization: user can inspect and correct the model
- AI as editorial assistant: rewriting, summarizing, enhancing content — not just ranking it
- Content-first minimal chrome
- Community signals (flags) feed back into AI processing

**Ditto relevance:** The transparent personalization is crucial for trust — Ditto users must understand why they're seeing what they're seeing. AI as editorial assistant (summarizing agent outputs, rewriting verbose reports) maps directly to Ditto's feed enrichment needs. Content-first design aligns with "the work surface is the product."

---

### 1.10 ChatGPT Pulse

**Source:** [OpenAI Introducing Pulse](https://openai.com/index/introducing-chatgpt-pulse/), [ChatGPT Pulse Help](https://help.openai.com/en/articles/12293630-chatgpt-pulse), [TechCrunch coverage](https://techcrunch.com/2025/09/25/openai-launches-chatgpt-pulse-to-proactively-write-you-morning-briefs/)

ChatGPT Pulse (Sep 2025) is the closest existing product to Ditto's proactive AI feed:

- **Proactive research:** ChatGPT does asynchronous research overnight based on past chats, memory, and feedback
- **Visual summary cards:** Results delivered as topical cards you can scan quickly or expand for detail
- **Progressive disclosure:** Scan at a glance → expand for more → ask follow-up questions
- **Personalization loop:** Thumbs up/down per card trains the system; explicit topic curation
- **Connected apps:** Gmail, Google Calendar integration (opt-in) for contextual awareness
- **Daily delivery:** New set of focused updates each morning
- **No prompting required:** The system initiates based on what it knows about you

**Key patterns:**
- Proactive AI that initiates without user prompting
- Visual card format with scan → expand → converse interaction model
- Overnight async processing for fresh content each day
- Connected app integration for richer context
- Lightweight feedback (thumbs up/down) for continuous personalization
- Memory-driven: synthesizes past conversations and stored memories

**Ditto relevance:** This is the gold standard reference for Ditto's AI-generated feed items. The proactive research model maps to Ditto's meta-processes (self-improvement, discovery). The card-based progressive disclosure with conversation follow-up is the exact interaction model Ditto needs. The memory-driven personalization is aligned with Ditto's commitment to continuity (Insight: stateless AI is the core frustration).

---

### 1.11 Reclaim.ai Planner

**Source:** [Reclaim.ai](https://reclaim.ai/), [Reclaim Planner Features](https://reclaim.ai/features/planner)

Reclaim provides a time-aware work feed:

- AI planner automatically schedules tasks, habits, meetings, focus time
- Integrates with Asana, ClickUp, Jira, Todoist, Linear, Google Tasks
- Automatically blocks calendar time for assigned tasks
- Reschedules when priorities shift — adaptive, not static
- Saves users ~7.6 hours/week through smarter scheduling

**Key pattern:** Time-as-context — the feed is organized around *when* things need attention, not just *what* happened. Work items have temporal urgency built in.

**Ditto relevance:** Ditto processes have deadlines, SLAs, and time-sensitive steps. A feed that understands temporal context (this review is due in 2 hours vs. this is informational) can prioritize accordingly.

---

## 2. Feed UX Mechanics

### 2.1 Card-Based vs. Stream-Based

| Aspect | Card-based | Stream-based |
|--------|-----------|--------------|
| Layout | Discrete rectangular containers with clear boundaries | Continuous flowing list, items separated by subtle dividers |
| Scanning | Chunked — eye moves card-to-card | Linear — eye scans continuously |
| Content density | Lower — each card has padding, borders | Higher — compact rows |
| Rich content | Natural home for images, charts, actions, previews | Awkward — rich content breaks the flow |
| Mobile | Touch-friendly, swipeable | Scroll-heavy |
| Heterogeneous content | Excellent — different card sizes/types coexist | Poor — different row heights feel jarring |
| Best for | Mixed content types, action-oriented items | Homogeneous notifications, activity logs |

**Source:** [Card UI Design examples (Eleken)](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners), [Activity Feed Design (GetStream)](https://getstream.io/blog/activity-feed-design/)

**Key insight:** Work-context feeds are inherently heterogeneous (a process completion, an AI insight, a review request, a shift report are all different shapes). Card-based layouts handle this naturally. Stream-based works for homogeneous notification lists.

**Ditto recommendation:** Card-based for the primary work surface feed; stream-based for the raw activity log / notification list.

---

### 2.2 Progressive Disclosure in Feeds

Three-level pattern observed across ChatGPT Pulse, Slack Activity, and Linear:

1. **Scan level** — one-line summary + icon + timestamp + urgency indicator. User decides whether to engage.
2. **Expand level** — full card content: details, context, preview of attached artifact. Peek/expand without navigating away.
3. **Full detail** — navigate to the full artifact, conversation, or process view.

**Source:** [Progressive Disclosure (NN/g)](https://www.nngroup.com/articles/progressive-disclosure/), [IxDF](https://ixdf.org/literature/topics/progressive-disclosure)

Progressive disclosure reduces cognitive load by showing only what's needed at each decision point. In a feed context, the scan level lets users make rapid triage decisions (engage vs. skip) without processing full content.

**Implementation patterns:**
- Accordion/expand in-place (Slack peek, ChatGPT Pulse card expand)
- Side panel (Slack side-by-side, email detail panes)
- Modal overlay (less common in feeds, breaks flow)
- Navigate to full view (Linear issue detail)

**Ditto recommendation:** Scan → Expand-in-place → Navigate. The middle tier (expand) is critical — it's where most triage decisions resolve without needing full navigation.

---

### 2.3 Grouping and Clustering

Observed grouping strategies:

| Strategy | Used by | How it works |
|----------|---------|-------------|
| By entity | Notion, Linear | All updates about one page/issue grouped together |
| By actor | Linear, Slack | Filter by who (or what agent) caused the update |
| By type | Monday.com, Slack | Notifications tab-filtered by category |
| By time | GitHub Feed | Chronological, no grouping |
| By source | Slack Activity | App notifications clustered separately from human messages |
| By urgency | Superhuman | AI classifies into Important vs. Other |
| Aggregation | GetStream, Linear | "Sam, Joan, and 12 others liked your post" — collapse similar events |

**Source:** [GetStream Activity Feed Design](https://getstream.io/blog/activity-feed-design/), [Activity Feed UX (Uxcel)](https://app.uxcel.com/courses/common-patterns/activity-feed-best-practices-646)

**Key insight:** The most effective feeds combine multiple grouping strategies. Linear groups by entity AND allows filtering by actor. Superhuman groups by urgency AND allows manual splits. No single axis is sufficient.

**Ditto recommendation:** Primary grouping by process (entity), with secondary facets for actor (agent/human), urgency (needs attention / informational / completed), and type (output ready / review needed / insight / shift report).

---

### 2.4 Rich Media in Feed Cards

Patterns observed:

- **Inline previews:** Document snippets, code diffs, image thumbnails (GitHub, Notion)
- **Charts and visualizations:** Sparklines, progress bars, mini-charts within cards (analytics dashboards)
- **Interactive elements:** Approve/reject buttons, star ratings, toggles (Asana, Monday.com)
- **Status indicators:** Progress bars, step indicators, confidence meters (process tools)
- **Audio players:** Inline audio playback for digests (Linear Pulse)
- **Expandable sections:** Accordion content within a card (ChatGPT Pulse)

**Key insight:** Rich media in feed cards must be *subordinate* to scannability. The card title + one-line summary must be comprehensible without engaging with any rich content. Rich media adds depth for users who choose to engage, not noise for those scanning.

---

### 2.5 Feed Item Actions

Observed action patterns across products:

| Action | Products | Purpose |
|--------|----------|---------|
| Approve / Reject | Asana, custom HITL | Decision actions — resolve a review |
| Reply / Comment | Asana, Notion, Monday | Conversation inline |
| Bookmark / Save | Monday, Asana | "Deal with later" |
| Pin to top | Monday | Keep visible despite new items |
| Archive / Dismiss | Notion, Asana, Slack | "I've seen this, remove from active" |
| Snooze | Linear, Slack | "Remind me later" |
| Mark read/unread | All | Triage state |
| Create follow-up | Asana | Spawn new work from a feed item |
| Thumbs up/down | ChatGPT Pulse | Train personalization |
| Suggest more/less | Apple News | Coarse topic tuning |
| Mute source | Apple News, Notion | Stop seeing updates from this source |

**Ditto recommendation:** Core actions for Ditto feed items:
- **Approve / Reject / Comment** — for review items (trust-tier actions)
- **Expand / Navigate** — progressive disclosure
- **Snooze** — "not now, remind me"
- **Dismiss** — "I've seen this"
- **Pin** — keep important items visible
- **Follow-up** — create a new process step or task from this item
- **Tune** — "more like this" / "less like this" for AI-generated items

---

### 2.6 Feed Filtering and Customization

Two approaches observed:

**Predefined tabs:** Monday.com (All / Unread / Mentioned / Assigned), Superhuman (Important / Other). Low cognitive load, fast to switch.

**Faceted filters:** Linear (by type, by actor), Asana (by person, by assignment, by mention). More flexible, higher learning curve.

**Key insight:** Tabs for the 80% case, faceted filters for power users. Most products offer both.

**Ditto recommendation:** Default tabs: "All" / "Needs attention" / "Completed" / "Insights". Advanced filters: by process, by agent, by trust tier, by date range.

---

### 2.7 Time-Based vs. Relevance-Based Ordering

| Ordering | Used by | Tradeoff |
|----------|---------|----------|
| Chronological (newest first) | GitHub Feed, Monday | Predictable, no "why am I seeing this?" confusion |
| Relevance-ranked | Google Discover, Apple News | Better signal-to-noise, but opaque |
| Hybrid (pinned + chronological) | Monday | User-controlled priority + time |
| Urgency-first | Superhuman | Most actionable items surface regardless of time |
| AI-personalized | ChatGPT Pulse, Artifact | Adapts to user, but requires trust and transparency |

**Key insight:** For *work* feeds (vs. content feeds), predictability matters more than optimization. Users need to trust they haven't missed something. Chronological with urgency-boosting is the safest default.

**Ditto recommendation:** Default to chronological with urgency boosting (items needing action float up). Allow user to switch to pure chronological. AI-personalized ordering as an opt-in "smart sort."

---

## 3. AI-Generated Feed Items

### 3.1 AI Insight Cards

How AI-generated insights could appear in a work feed:

**Pattern detected:**
```
[Insight icon] [timestamp]
"3 of your last 5 code reviews took >48 hours to complete.
 This is 2x longer than your team average."
[View trend] [Dismiss] [Tune: less like this]
```

**Recommendation:**
```
[Lightbulb icon] [timestamp]
"Based on the last sprint, moving the security review earlier
 in the pipeline could save ~4 hours per release."
[See analysis] [Try it] [Dismiss]
```

**Anomaly:**
```
[Warning icon] [timestamp]
"Process 'Customer onboarding' usually completes in 2 days.
 The current run has been stuck at 'compliance review' for 5 days."
[View process] [Escalate] [Snooze 1 day]
```

**Key design principles from ChatGPT Pulse and analytics dashboards:**
- Lead with the *insight*, not the data — "3 of 5 reviews took >48h" not "review completion time statistics"
- Provide context: comparison to baseline, trend direction, severity
- End with actions: view details, act on recommendation, dismiss, tune
- Confidence indicator: how certain is the AI about this insight?
- Provenance: what data sources fed this insight?

---

### 3.2 Process Update Cards

How process lifecycle events could appear:

**Step completed:**
```
[Check icon] [Process name] [timestamp]
"Step 'Code review' completed by @agent-reviewer"
Confidence: 94% | Duration: 12 min
[View output] [Approve] [View process]
```

**Review needed:**
```
[Eye icon] [Process name] [timestamp] [NEEDS ATTENTION badge]
"Step 'Security audit' needs your review"
Agent confidence: 72% — below auto-approve threshold
[Review now] [Snooze 1h] [Delegate]
```

**Output ready:**
```
[Package icon] [Process name] [timestamp]
"Process 'Quarterly report' complete — output ready"
[Preview report] [Download] [Share] [Archive]
```

**Key design principles:**
- Confidence score determines card urgency styling (below threshold = attention-needed)
- Agent attribution: which agent did this work
- Duration context: did this take longer/shorter than expected?
- Trust-tier actions: auto-approved items are informational, below-threshold items require action

---

### 3.3 Teaching Moment Cards

How the system could surface opportunities for the user to teach it:

```
[Graduation cap icon] [timestamp]
"I auto-approved 'Deploy to staging' (confidence: 91%).
 Was this the right call?"
[Yes, good call] [No, I should have reviewed] [Tell me more]
```

```
[Question icon] [timestamp]
"I'm unsure how to handle 'Vendor contract renewal' —
 I've seen two different patterns in your past processes.
 Which approach should I use going forward?"
[Show me the options] [Snooze] [I'll handle this one]
```

**Key design principles:**
- Frame as a question, not an assertion — the system is learning, not lecturing
- Lightweight response options (yes/no) for quick feedback
- "Tell me more" for when the user wants to teach in depth
- Don't cluster teaching moments — space them out to avoid "quiz fatigue"

---

### 3.4 Quiet Shift Report as a Feed Card

The shift report concept from the HITL research can manifest as a special feed card:

```
[Sunrise icon] Morning Briefing — March 23
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
While you were away:
• 4 processes completed normally
• 1 review waiting (Customer onboarding — compliance step)
• Agent confidence trending up on 'Code review' (87% → 92%)

Key numbers: 12 steps executed, 11 auto-approved, 1 needs you
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Expand full report] [Go to review] [Listen to audio summary]
```

**Two formats:**
1. **Card in feed** — compact, scannable, appears at the top of the feed as the first thing you see. Good for quick orientation.
2. **Full narrative** — expanded view with per-process details, trend charts, confidence movements, and recommendations. Good for deeper context.

**Audio option** (Linear Pulse pattern): Generate a 60-90 second audio summary for mobile/commute consumption.

**Key design principles:**
- Shift report is the *first card* in the feed when the user returns after absence
- Tone: concise, factual, no drama — "quiet reliable team" not "noisy approval queue"
- Numbers provide quick orientation: N completed, N waiting, N insights
- Single most important action surfaced prominently
- Expandable to full detail without navigating away

---

## 4. Feed Rendering Architectures

### 4.1 Heterogeneous Content (Component Registry Pattern)

**Source:** [Component Registry in React](https://medium.com/front-end-weekly/building-a-component-registry-in-react-4504ca271e56), [Function Registry Pattern](https://techhub.iodigital.com/articles/function-registry-pattern-react)

The core challenge: a feed contains many different card types (process update, AI insight, shift report, review request, output preview). Each has different layout, data shape, and action set.

**Component Registry pattern:**

```typescript
// Registry maps feed item types to React components
const feedCardRegistry: Record<string, React.ComponentType<FeedCardProps>> = {
  'process.step.completed': ProcessStepCard,
  'process.output.ready': OutputReadyCard,
  'review.needed': ReviewRequestCard,
  'insight.pattern': PatternInsightCard,
  'insight.anomaly': AnomalyCard,
  'shift.report': ShiftReportCard,
  'teaching.moment': TeachingMomentCard,
};

// Feed renderer looks up component by type
function FeedItem({ item }: { item: FeedItemData }) {
  const Card = feedCardRegistry[item.type];
  if (!Card) return <GenericCard item={item} />;
  return <Card {...item} />;
}
```

**Key properties:**
- New card types added by registering a component — no switch statements
- Fallback to GenericCard for unknown types — graceful degradation
- Each card component owns its own layout, actions, and expand behavior
- TypeScript discriminated unions for type-safe props per card type

**Relation to existing Ditto research:** The `rendered-output-architectures.md` report already covers json-render's catalog/registry pattern. Feed cards are a specific application of that same architecture — the feed is a rendered view whose items come from a catalog of card components.

---

### 4.2 Server-Driven Feed Composition

**Source:** [SDUI (Plasmic)](https://docs.plasmic.app/learn/sdui/), [React 19 and SDUI](https://ameersami.com/posts/React%2019%20and%20Server%20Driven%20UIs%20a%20Perfect%20Match/), [Server Driven UI patterns](https://medium.com/swlh/server-driven-ui-and-some-herbs-f17f01aa7794)

Server-driven UI means the server decides *what* to show and *how* to lay it out; the client renders from a schema.

For feeds, this means:

```json
{
  "feed": [
    {
      "type": "shift_report",
      "priority": 1,
      "data": { "completed": 4, "waiting": 1, "confidence_trend": "up" },
      "actions": ["expand", "navigate_review", "listen_audio"]
    },
    {
      "type": "review_needed",
      "priority": 2,
      "data": { "process": "Customer onboarding", "step": "Compliance", "confidence": 0.72 },
      "actions": ["review", "snooze", "delegate"]
    }
  ],
  "meta": {
    "ordering": "urgency",
    "total_unread": 3,
    "last_updated": "2026-03-23T08:00:00Z"
  }
}
```

**Key properties:**
- Server controls ordering, grouping, and which items appear
- Server can run A/B experiments on feed composition (Google Discover runs 150+)
- Client owns rendering and interaction polish
- Schema is the contract between server and client
- New item types require: server-side type definition + client-side card component

**Ditto relevance:** Ditto's engine already produces typed process events. The feed composition layer sits between the engine and the UI, selecting, ordering, and enriching events into a feed schema. This is a natural extension of the existing process-output architecture.

---

### 4.3 Real-Time Feed Updates

**Source:** [SSE in React](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view), [WebSocket vs SSE comparison](https://medium.com/@sulmanahmed135/websockets-vs-server-sent-events-sse-a-practical-guide-for-real-time-data-streaming-in-modern-c57037a5a589)

Three approaches for live feed updates:

| Approach | Direction | Best for | Complexity |
|----------|-----------|----------|------------|
| SSE (Server-Sent Events) | Server → Client | Feed updates, notifications, streaming | Low |
| WebSocket | Bidirectional | Chat, collaborative editing | Medium |
| Polling | Client → Server | Simple, fallback | Low |

**SSE is the natural fit for feeds:**
- Server pushes new feed items as they happen
- Single long-lived HTTP connection
- Auto-reconnect built into EventSource API
- Works through proxies and load balancers
- No client-side sending needed (feed is read-heavy)

**Implementation patterns for feed UX:**
- New items appear at top with subtle animation (not jarring)
- "N new items" banner instead of auto-scroll (user controls when to see new items)
- Items update in-place (e.g., confidence score changes, status transitions)
- Batch/throttle updates: if 50 events arrive in 1 second, batch into one UI update
- Optimistic updates for user actions (mark-read happens instantly, syncs in background)

**Performance considerations:**
- Virtualized lists for long feeds (only render visible items)
- Memoization to prevent re-renders of unchanged items
- State updates only on actual data change (avoid re-rendering for duplicate events)
- Web Workers for heavy processing of incoming event streams

**Ditto recommendation:** SSE for feed updates, with a "N new items" banner pattern. Items update in-place for status changes. Virtualized list for performance. WebSocket only if Ditto adds real-time collaborative features later.

---

### 4.4 GetStream Architecture Reference

**Source:** [Stream Feeds v3 Architecture](https://getstream.io/blog/feeds-v3-architecture/), [Scalable Activity Feed Architecture](https://getstream.io/blog/scalable-activity-feed-architecture/)

GetStream (the leading activity feed infrastructure provider) uses a Materialized Feed pattern:

- **Push model** for active users: when an event happens, fan-out to followers' materialized feeds
- **Pull model** for inactive users: compute on read
- **Hybrid (materialized)**: selectively fan-out based on user activity, combining read and write performance
- Ranking/aggregation fields are denormalized for <10ms feed loads
- Redis client-side caching for high-traffic feeds
- TiKV for storage (distributed key-value, multi-raft consensus)

**Key insight:** GetStream's architecture separates *event production* (something happened) from *feed composition* (what should this user see). Events are produced once; feeds are materialized per-user based on subscriptions, preferences, and ranking.

**Ditto relevance:** Ditto's engine produces process events. The feed layer materializes a per-user view: filtered by their processes, ordered by their preferences, enriched by AI (summaries, insights, shift reports). This separation of concerns maps directly.

---

## 5. Cross-Cutting Patterns

### 5.1 The Two-Layer Feed

Almost every mature product has converged on two layers:

1. **Curated/Smart layer** — AI-generated, editorially selected, or urgency-ranked. Small number of items. "What needs your attention." (Superhuman Important, ChatGPT Pulse cards, Linear Pulse, Apple News Top Stories, GitHub Dashboard modules)

2. **Chronological/Complete layer** — everything that happened, newest first. Full history. "What happened." (GitHub Feed, Notion All Updates, Monday All tab, Slack Activity full view)

The curated layer is *derived from* the chronological layer. Users can always drill down to the complete record.

### 5.2 Feedback-Driven Personalization

Products that personalize feeds use a consistent feedback loop:

1. **Implicit signals:** What the user reads, expands, acts on, ignores, skips
2. **Explicit lightweight signals:** Thumbs up/down, suggest more/less
3. **Explicit heavy signals:** Follow/block source, mute topic, configure filters
4. **Temporal signals:** Time of day, day of week, absence duration (for shift reports)

The gradient from implicit to explicit gives the system learning data without demanding user effort.

### 5.3 The Feed as Action Surface

The strongest work feeds are not read-only — they are action surfaces:

- Asana: reply, create follow-up, bookmark, archive inline
- Superhuman: reply, archive, snooze, forward without leaving feed
- Linear: mark read, snooze, navigate with keyboard shortcuts
- ChatGPT Pulse: thumbs up/down, expand, follow-up conversation

**Key principle:** Every feed item that requires action should be actionable *from the feed* without navigating away. The feed is not a list of links — it's a workspace.

### 5.4 Calm Design for Work Feeds

Multiple products explicitly optimize for reduced cognitive load:

- Superhuman: removed all decorative elements, sub-50ms interactions
- Linear: collapsed similar events, simplified headers
- Slack: grouped app notifications, peek without context switch
- Notion: selective triggers (not everything generates a notification)

**Key principle:** Work feeds must avoid the "noisy approval queue" pattern. Every element earns its place. Default to quiet; escalate only when attention is genuinely needed.

### 5.5 Audio and Alternative Consumption

- Linear Pulse: audio digest of daily summary
- ChatGPT Pulse: visual cards designed for scanning
- Yahoo News: AI-powered audio daily digest

This pattern enables feed consumption during commute, exercise, or when the user can't look at a screen. The shift report is a natural candidate for audio rendering.

---

## 6. Ditto-Specific Gaps (Not Addressed by Existing Products)

1. **Process-aware feed items** — No existing product has feed items that understand they're part of a multi-step process with trust tiers, confidence scores, and approval thresholds. Ditto's feed items carry richer metadata than any surveyed product.

2. **Agent attribution and transparency** — While Linear allows filtering by agent, no product surfaces *why* an agent made a decision or *how confident* it was. Ditto's feed items should include confidence, provenance, and reasoning-on-demand.

3. **Teaching moments in feed** — No surveyed product uses the feed as a bidirectional learning surface where the user teaches the system through lightweight interactions embedded in feed cards.

4. **Process graph context** — Feed items exist in isolation in all surveyed products. In Ditto, a feed item is a node in a process graph — the user should be able to see upstream (what led to this) and downstream (what happens next) from any feed card.

5. **Trust-tier-driven card behavior** — No surveyed product changes what actions are available on a card based on a dynamic trust score. In Ditto, a high-trust process might show "auto-approved" informational cards, while a low-trust process shows "review required" action cards for the same event type.

---

## 7. Recommended Architecture for Ditto Feed

Based on this research, the Ditto feed should be:

1. **Two-layer:** Curated smart feed (AI-composed, urgency-ranked) + full activity log (chronological)
2. **Card-based:** Component registry pattern with typed card variants per feed item type
3. **Server-composed:** Engine produces events → feed composition layer materializes per-user feed → client renders from schema
4. **Progressive disclosure:** Scan (one-line + icon) → Expand (full card in-place) → Navigate (full process/artifact view)
5. **Action-embedded:** Review, approve, snooze, follow-up, tune — all inline
6. **SSE-updated:** Real-time via Server-Sent Events, "N new items" banner pattern
7. **Feedback-learning:** Implicit (engagement) + explicit lightweight (thumbs, tune) + explicit heavy (filter config)
8. **Shift-report anchored:** Morning briefing card as the first item after absence
9. **Process-grouped:** Primary grouping by process, with facets for actor/urgency/type
10. **Calm by default:** Minimal chrome, selective notifications, quiet unless attention genuinely needed

---

Sources:
- [GitHub Dashboard refresh (Sep 2025)](https://github.blog/changelog/2025-09-04-the-dashboard-feed-page-gets-a-refreshed-faster-experience/)
- [GitHub Home dashboard update (Oct 2025)](https://github.blog/changelog/2025-10-28-home-dashboard-update-in-public-preview/)
- [Linear Inbox Docs](https://linear.app/docs/inbox)
- [Linear Pulse (Apr 2025)](https://linear.app/changelog/2025-04-16-pulse)
- [Linear UI Refresh (Mar 2026)](https://linear.app/changelog/2026-03-12-ui-refresh)
- [Slack UI redesign](https://diginomica.com/slack-updates-ui-more-focus-simplify-navigation)
- [Slack feature drops Dec 2025](https://slack.com/blog/news/feature-drop-dec25)
- [Notion Inbox & Notifications](https://www.notion.com/help/updates-and-notifications)
- [Asana Inbox Guide](https://asana.com/guide/get-started/try/inbox-notifications)
- [Monday.com Update Feed](https://support.monday.com/hc/en-us/articles/115005309885-The-Update-Feed-Inbox)
- [Superhuman Split Inbox](https://blog.superhuman.com/how-to-split-your-inbox-in-superhuman/)
- [Superhuman AI Email](https://blog.superhuman.com/the-best-ai-email-management-tool/)
- [Apple News customization](https://appleinsider.com/inside/apple-news/tips/inside-apple-news---how-to-get-the-most-out-of-your-curated-news-sports-puzzles-feed)
- [Google Discover ranking research](https://searchengineland.com/google-discover-qualifies-ranks-filters-content-research-470190)
- [UX of Artifact (UX Collective)](https://uxdesign.cc/the-ux-of-artifact-c15726cb58b8)
- [OpenAI Introducing ChatGPT Pulse](https://openai.com/index/introducing-chatgpt-pulse/)
- [ChatGPT Pulse (TechCrunch)](https://techcrunch.com/2025/09/25/openai-launches-chatgpt-pulse-to-proactively-write-you-morning-briefs/)
- [Reclaim.ai](https://reclaim.ai/)
- [Progressive Disclosure (NN/g)](https://www.nngroup.com/articles/progressive-disclosure/)
- [Card UI Design (Eleken)](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)
- [Activity Feed Design (GetStream)](https://getstream.io/blog/activity-feed-design/)
- [GetStream Feeds v3 Architecture](https://getstream.io/blog/feeds-v3-architecture/)
- [Scalable Activity Feed Architecture (GetStream)](https://getstream.io/blog/scalable-activity-feed-architecture/)
- [Component Registry in React](https://medium.com/front-end-weekly/building-a-component-registry-in-react-4504ca271e56)
- [Function Registry Pattern](https://techhub.iodigital.com/articles/function-registry-pattern-react)
- [SDUI (Plasmic)](https://docs.plasmic.app/learn/sdui/)
- [React 19 and SDUI](https://ameersami.com/posts/React%2019%20and%20Server%20Driven%20UIs%20a%20Perfect%20Match/)
- [SSE in React](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view)
- [LinkedIn LLM-Powered Feed Algorithm 2026](https://almcorp.com/blog/linkedin-feed-algorithm-update-llm-2026/)
- [Activity Feed UX best practices (Uxcel)](https://app.uxcel.com/courses/common-patterns/activity-feed-best-practices-646)
- [Chronological Activity Feed Design (Aubergine)](https://www.aubergine.co/insights/a-guide-to-designing-chronological-activity-feeds)
