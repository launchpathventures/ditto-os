# AI Chat UX Patterns: Competitive Audit

**Date:** 2026-03-31
**Status:** Complete
**Consumer:** UI/UX Overhaul (launchpathventures/ui-ux-overhaul branch)

---

## 1. Prompt Input Design

### Claude.ai
- **Shape:** Rounded-rectangle text area, bottom-center of the main panel. Grows vertically as the user types (auto-expanding textarea).
- **Placeholder text:** "Reply to Claude..." (in-conversation) / "How can Claude help you today?" (new conversation).
- **Left-side controls:** A slider/tools icon that opens a dropdown for toggling **Web search** and **Extended thinking** on/off.
- **Right-side controls:** Paperclip icon for file attachment, a "+" button for additional options (projects, artifacts). Send button (arrow icon) appears when text is present.
- **Model picker:** Dropdown at the top of the chat (not in the input area) showing current model (e.g., "Claude 4 Sonnet"). Click to switch models.
- **Keyboard shortcut:** Enter to send, Shift+Enter for newline. No visible shortcut hints in the input itself.
- **Premium feel:** Minimal chrome. The input is the only dominant element on screen. Generous whitespace. No borders on the input area — it floats with a subtle shadow. Purple accent only on the Claude logo/spinner. The restraint IS the premium signal.

### ChatGPT
- **Shape:** Rounded-rectangle input bar, bottom-center, with a pill-like shape (more rounded corners than Claude). Also auto-expands.
- **Placeholder text:** "Message ChatGPT" (the exact text varies by context; on the home screen it reads "Ask anything").
- **Left-side controls:** Paperclip icon (file/image upload), "+" button that reveals Agent mode, code interpreter, and other tools.
- **Right-side controls:** Globe icon (toggle web search), microphone icon (voice input), send arrow.
- **Model picker:** Dropdown at top-center of the conversation area. Shows current model/mode: "Auto," "Fast," or "Thinking" (since GPT-5 era). Previously showed model names directly (GPT-4o, o3, etc.).
- **Keyboard shortcut:** Enter to send, Shift+Enter for newline. Cmd+K / Ctrl+K opens conversation search.
- **Premium feel:** The input "shimmers" subtly during streaming (a light gradient animation on the border). Dark mode uses near-black backgrounds with frosted-glass panels. The input bar has a subtle inner shadow.

### Cursor
- **Shape:** Standard VS Code-style input at the bottom of the side panel (Cmd+L to open). Narrower than web chat products because it lives in a sidebar.
- **Input:** Plain text area. Slash commands (/) open a menu of repeatable prompts. @ mentions for files, symbols, docs.
- **Controls:** Model selector dropdown above the input. Mode toggle: Code / Chat / Plan modes.
- **Context indicator:** Shows how much of the context window you're using, directly in the chat panel.
- **Premium feel:** Tight integration with editor. The input feels like part of the IDE, not a bolt-on chat widget.

### Windsurf (Cascade)
- **Access:** Cmd+L or Cascade icon in top right. Opens as a side panel (like Cursor).
- **Input:** Text area at the bottom of the Cascade panel. Model selector dropdown below the input area.
- **Modes:** Code Mode (creates/modifies code), Chat Mode (exploration/questions), Plan Mode (type "megaplan" for advanced planning form).
- **Controls:** Messages can be queued — press Enter while Cascade is processing to queue, Enter again on empty to send immediately.
- **Premium feel:** The AI panel and code editor merge into a single flow. Feels less like "chat" and more like collaborative editing.

### Perplexity
- **Shape:** Large, prominent search-bar style input, centered on the page (new query). More like Google's search box than a chat input.
- **Placeholder text:** "Ask anything..."
- **Controls:** Attachment icon (for files/images), "Focus" selector (choose search scope: Web, Academic, Writing, Math, Video, Social). Model picker for Pro users.
- **Follow-up:** After initial answer, a smaller input appears below for follow-up questions — shifting from search-bar metaphor to conversational.
- **Premium feel:** The search-bar positioning communicates "ask me anything" with authority. The Focus selector is a distinctive differentiator — no other product has this.

### Summary Pattern
Every product uses a bottom-anchored, auto-expanding textarea with rounded corners. The differentiators are: (a) what controls surround the input, (b) whether it feels like "chat" (Claude, ChatGPT) vs "search" (Perplexity) vs "IDE command" (Cursor, Windsurf), and (c) how model/mode selection is surfaced.

---

## 2. Message Streaming Feel

### Common Technical Pattern
All products stream tokens from the LLM API. The raw stream is token-by-token (roughly word-by-word, sometimes sub-word). The visual effect depends on the rendering layer.

### Claude.ai
- **Token rendering:** Words appear incrementally, roughly word-by-word. Markdown is rendered progressively — headings, bold, lists render as their syntax completes.
- **Cursor/caret:** A blinking purple caret (block cursor) appears at the end of the streaming text. Disappears when generation completes.
- **Auto-scroll:** The viewport auto-scrolls to follow new content. If the user scrolls up manually, auto-scroll pauses (a "scroll to bottom" button appears). Resumes when user clicks it or scrolls back down.
- **Code blocks:** Appear with syntax highlighting as they stream. The code block container appears first (with language label), then fills incrementally.
- **Timing feel:** Moderate speed. Feels deliberate, not rushed. Pauses naturally at paragraph boundaries.

### ChatGPT
- **Token rendering:** Similar word-by-word streaming. The input bar border "shimmers" during generation (subtle animated gradient).
- **Cursor/caret:** A blinking dark cursor at the streaming edge. Less prominent than Claude's purple caret.
- **Auto-scroll:** Same pattern — follows content, pauses on manual scroll, "scroll to bottom" button appears.
- **Markdown:** Rendered progressively. Known technical challenge: incomplete markdown (half-rendered bold, flickering code blocks) is handled by buffering — the renderer waits for complete syntax before rendering formatted output.
- **Timing feel:** Generally faster perceived speed than Claude. The shimmer animation on the input bar provides ambient feedback even when the user isn't watching the text.

### Cursor
- **Streaming:** AI responses appear in the side panel with streaming text. When making code changes, the diff view opens side-by-side with clear color coding (green for additions, red for deletions).
- **Inline changes:** Code edits stream directly into the editor as diffs. The user sees lines being added/modified in real-time.
- **Feel:** Lightweight and responsive. The focus is on the code changes appearing in the editor, not the chat text.

### Windsurf (Cascade)
- **Streaming:** Cascade explains what it's doing while executing. Text streams in the side panel while file edits happen in the editor simultaneously.
- **Real-time awareness:** Monitors terminal commands, file edits, and clipboard in real-time. No need to re-explain context.
- **Feel:** More "working alongside you" than "talking to you." The streaming text is secondary to the actual code changes happening.

### Perplexity
- **Answer streaming:** Text appears progressively. Sources panel populates first (or simultaneously), then the answer text streams with inline numbered citation markers ([1], [2], etc.) appearing as they're generated.
- **Multi-format:** Images, videos, maps can appear inline as the answer assembles.
- **Related questions:** Appear at the bottom after the answer completes, not during streaming.
- **Feel:** Feels like a page "building itself" rather than someone typing. The sources-first pattern gives immediate credibility before the answer even finishes.

### Key Library: Streamdown (by Vercel)
The industry standard for streaming markdown rendering. Used by Mintlify, Supabase, Cloudflare, Sentry, AWS, HuggingFace, and others. Key features:
- Built-in **streaming caret** (animated indicator at stream edge)
- **Unterminated block handling** — renders incomplete markdown gracefully (no flickering)
- **Per-word animation** (not character-by-character)
- Shiki-powered syntax highlighting, KaTeX math, Mermaid diagrams
- Solves the O(n^2) re-parse problem by using incremental AST-level rendering

---

## 3. Thinking/Reasoning Display

### Claude.ai — Extended Thinking
- **Toggle:** Enabled via "Search and tools" button (lower-left of input area) → "Extended thinking" toggle switch. Toggling starts a new conversation.
- **During processing:** A **"Thinking" indicator with a live timer** appears, showing elapsed seconds (e.g., "Thinking... 12s"). This is above the response area.
- **After completion:** A **collapsible "Thinking" section** appears above the response. Collapsed by default (shows a summary line). Click chevron to expand and see the full reasoning trace.
- **Visual treatment:** The thinking block has a distinct background color (slightly tinted, set apart from the main response). The expanded view shows Claude's internal reasoning as flowing text — not bullet points, but natural language problem-solving.
- **Truncation:** Occasionally, thinking is truncated with a message: "the rest of Claude's thought process is not available" (safety system intervention).
- **Interleaved thinking:** In multi-tool-call scenarios (API), Claude can think between tool calls — the UI shows thinking blocks interspersed with tool use blocks.

### ChatGPT — Thinking Mode
- **Toggle:** Mode selector at top of conversation: "Auto" / "Fast" / "Thinking." Since GPT-5.4, there are also thinking level presets: **Standard, Extended, Heavy.**
- **During processing:** Displays **"Thinking..."** with an animated indicator. Some versions show a visible token counter: "Thinking tokens used: 214 / Budget: 1,024."
- **After completion:** An expandable section shows the reasoning plan. The thinking is presented as a structured upfront plan before the actual response — users see the model's approach before its conclusion.
- **Visual treatment:** The thinking section is collapsible. Less emphasis on it being a "trace" and more emphasis on it being a transparent plan. The retry menu (three dots beneath response) lets users regenerate specifically with "Thinking" or "Pro" modes.
- **Differentiation from Claude:** ChatGPT emphasizes thinking as a **plan preview** ("here's how I'll approach this"). Claude emphasizes it as a **reasoning trace** ("here's how I worked through this").

### Cursor
- **Plan Mode:** Generates an editable Markdown plan displayed within the editor — a to-do list with file paths and code references. Not a hidden "thinking" block, but a visible, editable plan document.
- **During agent execution:** Shows the agent's current action/step in the chat panel. No separate "thinking" display — the plan IS the thinking.

### Windsurf (Cascade)
- **Plan display:** Cascade typically responds with a plan before executing. The plan appears as regular chat text, then Cascade begins executing steps.
- **Todo tracking:** Complex tasks show a todo list within the conversation that tracks progress.
- **No separate thinking block:** Reasoning is woven into the conversational response.

### Perplexity
- **Step tabs:** In the app and Comet browser, shows **steps as tabs above the results pane** — a horizontal tab bar showing search queries executed, analysis steps, and synthesis. Each tab is clickable to see that step's detail.
- **Pro Search:** When using Pro Search, shows an expanding list of sub-queries being executed, with real-time status for each.
- **No "thinking" block per se:** The transparency is in showing WHAT it searched, not HOW it reasoned.

---

## 4. Tool/Function Call Display

### Claude.ai
- **Web search:** An inline indicator appears: "Searching the web..." (or similar). After completion, search results are woven into the response with **inline citations** — superscript numbers linking to source URLs. Source links appear as clickable references.
- **Code execution (artifacts):** Opens a **side panel** (the Artifacts panel) showing generated code, HTML, or interactive content. The artifact renders live alongside the conversation. The user sees both the explanation and the running result simultaneously.
- **File analysis:** When analyzing uploaded files, shows an indicator during processing, then presents results inline.
- **Visual treatment:** Tool use is relatively **understated** — a brief status line during execution, then results folded into the natural response. No separate "tool call" cards.

### ChatGPT
- **Web search:** Shows **"Searching the web..."** as an inline status message with a spinning indicator. After completion, results appear with inline citations (numbered references, clickable). A globe icon may appear beside the status.
- **Code execution:** Shows **"Running code..."** or **"Analyzing..."** with a code sandbox indicator. The code and its output appear in a collapsible block. Python execution happens in a sandboxed environment — users see both the code and its output (including charts, tables).
- **Image generation:** Shows **"Creating image..."** with a progress state. The image appears inline when complete.
- **Canvas:** For extended editing tasks, opens a separate **Canvas** panel (side-by-side with chat) for collaborative editing of text or code.
- **Agent mode:** When using Agent mode (via the "+" menu), shows a sequence of tool calls with status indicators. Each tool call can be expanded to see details.
- **Visual treatment:** Tool calls are **more visually prominent** than Claude's — they get their own status lines and often expandable detail blocks.

### Cursor
- **File reads/edits:** Shown inline in the chat as collapsible blocks. "Reading file X..." → shows file content. "Editing file X..." → opens a diff view in the editor.
- **Terminal commands:** Commands and their output appear in the chat. Terminal execution is visible.
- **MCP tools:** Since v2.6, MCP servers can render **interactive UI components directly inside the chat panel** (e.g., Figma MCP renders design specs beside code diffs).
- **Diff display:** The signature pattern — a **PR-style review interface**. File changes appear as colored diffs. Previously showed inline diffs with Accept/Reject buttons per change; newer versions auto-apply changes and show diffs in the chat panel. Users have noted friction around this change (loss of granular accept/reject).

### Windsurf (Cascade)
- **File edits:** Cascade identifies which files need changes and executes edits across multiple files while explaining what it's doing in the chat panel.
- **Terminal commands:** Runs commands and shows output. Turbo Mode allows autonomous terminal execution without approval.
- **Checkpoints:** **Revert arrows appear on hover over prompts** — every state is a checkpoint you can roll back to. This is Windsurf's distinctive pattern: every tool action creates a recoverable state.
- **Progress:** A "continue" button appears when tool call limits are hit. Auto-Continue mode handles this automatically.
- **Send to Cascade:** Errors and problems can be sent to Cascade as @mentions, integrating tool results back into the conversation.

### Perplexity
- **Source retrieval:** The most distinctive tool display of any product. Sources appear as **numbered cards/pills at the top of the answer**, each showing favicon + domain name. These populate before or simultaneously with the answer text.
- **Inline citations:** Numbered superscripts [1], [2], etc. within the answer text. Clicking jumps to the source. Hovering shows a preview (title + favicon) for quick scanning.
- **Pro Search steps:** Shows a vertical list of sub-queries being executed: "Searching for X...", "Analyzing Y...", each with a status indicator (spinner → checkmark).
- **Multi-format results:** Images, videos, and maps appear inline within the answer, pulled from search results.
- **Visual treatment:** Tool use (search) is the CORE experience, not a side feature. The sources-first layout communicates "I found these, and here's what they say" rather than "I think X (and here's a citation)."

---

## 5. Message Actions

### Claude.ai
- **Position:** Action icons appear **below the message**, left-aligned. Visible on hover (desktop) or always visible (mobile).
- **Actions on Claude's responses:** Copy (clipboard icon), Retry/Regenerate (refresh icon), Thumbs up, Thumbs down.
- **Actions on user messages:** Edit (pencil icon) — rewrites the message and regenerates from that point.
- **Artifacts:** Have their own action bar (copy code, download, expand to full screen).
- **No "share" button** on individual messages (sharing is at the conversation level).

### ChatGPT
- **Position:** Action icons appear **below the response**, left-aligned. Appear on hover.
- **Actions on ChatGPT responses:** Copy, Regenerate, Like (thumbs up), Dislike (thumbs down), Share, "Edit in Canvas" (opens the response in the Canvas editor).
- **Actions on user messages:** Edit (pencil icon) — click to edit and resubmit.
- **Regenerate with model:** The three-dot menu (more options) beneath responses lets you regenerate specifically with Thinking mode or Pro mode.
- **Read aloud:** An option to have the response read aloud (speaker icon).
- **Response selector:** When multiple regenerations exist, a left/right arrow selector appears to browse between response versions (e.g., "2/3").

### Cursor
- **Chat responses:** Copy button on code blocks. Apply button to apply suggested changes to code.
- **Diff actions:** Accept / Reject per file change (though recent versions trend toward auto-apply with undo via checkpoints).
- **No thumbs up/down** — feedback is implicit through whether the user accepts changes.

### Windsurf (Cascade)
- **Revert arrows:** Appear on hover over user prompts — revert to the state before that prompt. This is the primary "undo" mechanism.
- **Named checkpoints:** Can be created and navigated at any time for complex workflows.
- **Minimal hover actions:** The checkpoint/revert model replaces the traditional regenerate pattern.

### Perplexity
- **Actions on answers:** Copy, Share, "Rewrite" (adjust answer style), Bookmark/Save to Collection.
- **Source actions:** Each source card is clickable to open the original page.
- **Follow-up:** A dedicated follow-up input appears below the answer, pre-populated with suggested related questions.
- **Related questions:** 3-4 suggested follow-up questions appear as clickable chips below the answer.

---

## 6. Empty State / Welcome Screen

### Claude.ai
- **Layout:** Centered vertically on the page. Claude logo at top. Large input area in the center (same as the conversation input, but more prominent).
- **Greeting:** "How can Claude help you today?" (or similar contextual greeting).
- **Suggestions:** A few suggestion chips/cards below the input, showing example prompts (e.g., "Help me write...", "Analyze this data...", "Explain a concept..."). These are contextual and can change.
- **Branding:** Minimal. The Claude wordmark and a small model indicator. The empty state takes up most of the screen — very generous whitespace.
- **Sidebar:** Left panel shows conversation history, Projects, and starred conversations. Collapsible.
- **Feel:** Calm, unhurried. The empty state says "I'm ready when you are" rather than "look at all these features."

### ChatGPT
- **Layout:** Centered. OpenAI/ChatGPT logo at top-center. Large greeting text: "What can I help with?" Input bar below the greeting, horizontally centered and wider than in-conversation.
- **Suggestions:** 4 suggestion tiles/cards arranged in a 2x2 grid (or horizontal row) below the input. Each has an icon and short text (e.g., "Create an image", "Summarize text", "Write code", "Analyze data"). These rotate/personalize based on user history.
- **Model selector:** Visible at the top: "Auto" / "Fast" / "Thinking" mode toggle.
- **Branding:** More prominent than Claude. The ChatGPT logo and "ChatGPT" text are clearly displayed. The greeting text is large and friendly.
- **Below input:** "ChatGPT can make mistakes. Check important info." disclaimer.
- **Feel:** Warmer, more "assistant-like." The suggestions actively guide the user toward doing something.

### Cursor
- **Empty chat panel:** Shows the Cursor/model branding. A text input with "@" file mention hints. Recent context from the codebase may be pre-loaded.
- **No suggestion cards** — the IDE context IS the context. The empty state assumes you know why you're here.
- **Feel:** Developer-tool minimal. No hand-holding.

### Windsurf (Cascade)
- **Empty panel:** Shows Cascade branding. Input at bottom.
- **Context awareness:** Even in empty state, Cascade has already indexed the codebase. The empty state implicitly says "I already know your project."
- **Feel:** Similar to Cursor — professional, no consumer-friendly suggestions.

### Perplexity
- **Layout:** The most search-engine-like. Large centered search bar dominating the page. "Where knowledge begins." tagline.
- **Below input:** Trending topics or curated "Discover" feed showing current news/topics as cards with images.
- **Focus selector:** Prominently displayed — Web, Academic, Writing, Math, Video, Social — as icon-labeled filters.
- **Sidebar:** Library (saved threads), Collections, Discover feed.
- **Feel:** The most "content-forward" empty state. Not waiting for you — already showing you interesting things to explore. Feels like opening a smart newspaper that also takes questions.

---

## Cross-Cutting Patterns and Takeaways for Ditto

### What Makes Input Feel Premium
1. **Auto-expanding textarea** that grows with content (never a fixed-height box)
2. **Minimal surrounding chrome** — the input should breathe
3. **Contextual controls** that appear when relevant (not all buttons visible at all times)
4. **Subtle animation** on the input during streaming (ChatGPT's shimmer)
5. **Model/mode selection** separated from the input area (above it, not cluttering it)

### Streaming Best Practices
1. **Word-by-word** (not character-by-character) — matches LLM token boundaries
2. **Visible caret/cursor** at the stream edge — confirms liveness
3. **Incremental markdown rendering** — use AST-level animation (Streamdown pattern)
4. **Auto-scroll with manual override** — follow content, but respect user scroll-up
5. **Ambient liveness indicators** even outside the text (border shimmer, spinner)

### Thinking Display Consensus
1. **Collapsible by default** — don't force users to read reasoning
2. **Live timer or token counter** during processing — "this is working" signal
3. **Distinct visual container** — thinking is not the response, set it apart
4. **Summary line when collapsed** — one-line preview of the reasoning approach

### Tool Call Display Patterns
1. **Inline status line** during execution ("Searching the web...", "Reading file X...")
2. **Spinner → checkmark** state transition per step
3. **Collapsible detail** — show what was done, let user dig into specifics
4. **Results woven into response** (Claude, ChatGPT) OR **results shown separately first** (Perplexity sources)
5. **Checkpoint/revert** for destructive tool actions (Windsurf's pattern)

### Message Action Positioning
1. **Below the message, left-aligned** — universal pattern
2. **Visible on hover** (desktop), always visible (mobile)
3. **Core set:** Copy, Regenerate, Like/Dislike
4. **Extended set:** Edit, Share, Read aloud, "Edit in Canvas"
5. **Response versioning** — ChatGPT's left/right arrows for browsing regenerations

### Empty State Design
1. **Centered layout** with generous whitespace — universal
2. **Large input as hero element** — the input IS the call-to-action
3. **Suggestion chips/cards** — 3-4 contextual prompts to reduce blank-page anxiety
4. **Minimal branding** — logo + tagline, nothing more
5. **Perplexity's pattern:** Show content/discovery feed — don't just wait, inspire

---

## Sources

- [Comparing Conversational AI Tool User Interfaces 2025 | IntuitionLabs](https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025)
- [Using Extended Thinking | Claude Help Center](https://support.claude.com/en/articles/10574485-using-extended-thinking)
- [Enabling and Using Web Search | Claude Help Center](https://support.claude.com/en/articles/10684626-enabling-and-using-web-search)
- [Cursor AI Review 2026 | Prismic](https://prismic.io/blog/cursor-ai)
- [Windsurf Cascade Docs](https://docs.windsurf.com/windsurf/cascade/cascade)
- [Windsurf Review 2026 | Second Talent](https://www.secondtalent.com/resources/windsurf-review/)
- [The UX of AI: Lessons from Perplexity | NN/g](https://www.nngroup.com/articles/perplexity-henry-modisett/)
- [AI UX Patterns: Stream of Thought | ShapeofAI.com](https://www.shapeof.ai/patterns/stream-of-thought)
- [AI UX Patterns: Open Input | ShapeofAI.com](https://www.shapeof.ai/patterns/open-input)
- [AI UX Patterns: Citations | ShapeofAI.com](https://www.shapeof.ai/patterns/citations)
- [Streamdown: Open Source Markdown for AI Streaming | Vercel](https://vercel.com/changelog/introducing-streamdown)
- [Streaming Markdown Renderer for the AI Era | DEV Community](https://dev.to/kingshuaishuai/from-on2-to-on-building-a-streaming-markdown-renderer-for-the-ai-era-3k0f)
- [Perplexity Platform Guide: Citation-Forward Answers | Unusual](https://www.unusual.ai/blog/perplexity-platform-guide-design-for-citation-forward-answers)
- [How AI Engines Cite Sources | Medium](https://medium.com/@shuimuzhisou/how-ai-engines-cite-sources-patterns-across-chatgpt-claude-perplexity-and-sge-8c317777c71d)
- [UI/UX Design Trends for AI-First Apps in 2026 | GroovyWeb](https://www.groovyweb.co/blog/ui-ux-design-trends-ai-apps-2026)
- [Chat UI Design Trends 2025 | MultitaskAI](https://multitaskai.com/blog/chat-ui-design/)
- [OpenAI Apps SDK: UX Principles](https://developers.openai.com/apps-sdk/concepts/ux-principles)
- [OpenAI Apps SDK: UI Guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)
- [Cursor Beta Features 2026 | Markaicode](https://markaicode.com/cursor-beta-features-2026/)
