# Research Report: First Output Review UX — How Content Tools Present AI-Generated Output

**Date:** 2026-03-24
**Research question:** How should Ditto present generated content (e.g., 5 Instagram posts) so the user can see what knowledge shaped it, edit with confidence, gauge quality, and feel like they're collaborating — not reviewing AI homework?
**Triggered by:** Libby persona scenario — first content output after onboarding (brand voice, ideal client, business stage defined)
**Consumers:** Dev Designer (output review surface), Dev Architect (output rendering, provenance component), Phase 10 MVP

---

## Context

Libby has just finished her first Ditto conversation. She defined her brand voice (safe, practical, real), her ideal client (first-time mums, professional women 30s), and her business stage (building). Ditto is now producing 5 Instagram posts for her to review.

This is a critical moment. If the output feels like "raw AI text dumped on screen," Libby's trust drops. If it feels like a thoughtful colleague drafted something using everything she told them, trust compounds.

This report surveys 12+ products to extract patterns for presenting AI-generated content for human review and editing. The focus is on four questions:

1. How do tools show **what knowledge went into the output**?
2. How do they make **editing feel collaborative**, not corrective?
3. How do they signal **quality** across multiple pieces?
4. How do they avoid the **"reviewing AI output" feeling**?

---

## Products Surveyed

| Product | Category | Key pattern extracted |
|---------|----------|---------------------|
| Jasper AI | Marketing content | Brand Voice + Knowledge Base as visible generation inputs; campaign bundles |
| Copy.ai | Marketing content | Google Docs-style editor alongside chat; Rewrite/Improve actions |
| Writer.com | Enterprise writing | Style guide compliance score (0-100); real-time inline enforcement; governance layer |
| Notion AI | Workspace/docs | Inline generation as native blocks; grey/blue diff for edits; slash-command familiarity |
| Canva Magic Write | Design/content | Content generation embedded in visual design context; lightweight editing |
| ChatGPT Canvas | General AI | Dual-pane workspace; highlight-to-edit; version history; shortcut actions |
| Claude Artifacts | General AI | Separate artifact window; version toggle; conversation explains, artifact embodies |
| Grammarly | Writing assistant | Real-time tone detector; brand tone on/off-brand indicators; score-based feedback |
| Anyword | Performance marketing | Predictive Performance Score (0-100) per content piece; demographic resonance; emotion analysis |
| Typeface | Enterprise content | Voice training from samples; unified visual workspace; audience-segment adaptation |
| Writesonic | SEO content | Content optimization score; recommended terms; one-click score improvement |
| Google Docs + Gemini | Document editing | Inline suggestions with accept/reject; rephrase/shorten/elaborate quick actions |

---

## Pattern 1: Provenance — "Based on" Signals

**The problem:** Most tools do NOT show what knowledge shaped the output. The user generates content and gets text back with no indication of what inputs were used. This is the industry's biggest gap.

### What exists today

**Jasper** is the closest to provenance. Its Brand Voice feature lets you toggle which voice profile is active, and the Knowledge Base feeds "source of truth" documents into generation. But the connection is implicit — you set up Brand Voice before generating, and trust it was used. There is no per-output indicator saying "this post used your brand voice profile + your ideal client description."

**Writer.com** enforces rules visibly through a compliance score (0-100) in the top-right corner. Writers see real-time suggestions when they violate style rules. But this is enforcement on human writing, not provenance on AI output. The rules are visible as a governance layer, not as "here's what shaped this draft."

**Anyword** comes closest to per-output metadata. Each generated content piece gets a Predictive Performance Score panel that, on hover, shows: demographics likely to resonate, emotions driving the copy, main offerings/features/pains/benefits detected, and platform policy compliance. This is not provenance (what went IN) but quality analysis (what came OUT) — still, the pattern of a metadata panel per content piece is directly relevant.

**Claude Artifacts** and **ChatGPT Canvas** show no provenance. The conversation IS the context, but the artifact/canvas doesn't reference back to it.

### What does not exist (and Ditto should pioneer)

No tool surveyed shows a compact, per-output "Based on" section that traces back to the user's knowledge:

```
Written using: Brand voice (safe, practical, real) · Audience (first-time mums, 30s, professional) · Stage (building — awareness focus)
```

This is Insight-083's core claim: knowledge must be visible and traceable. The "Based on" pattern is the output-side manifestation.

**Recommendation for Ditto:** Every output card should have a collapsible "Based on" section showing which knowledge documents shaped it. Not citations in an academic sense — more like a colleague saying "I wrote this with your brief in mind." Compact by default, expandable for detail.

---

## Pattern 2: Quality Signals Across Multiple Pieces

**The problem:** When presenting 5 posts, the user needs to quickly see which are strong and which need work — without reading all 5 in detail.

### What exists today

**Anyword's Predictive Performance Score** is the gold standard here. Each content variant gets a 0-100 score with a color indicator. Users can scan scores before reading content. The score panel breaks down WHY — demographic fit, emotion, platform compliance. This gives the user a triage mechanism: read the 90+ pieces first, spend editing energy on the 60s.

**Writer.com's compliance score** does this for brand adherence — a single number in the corner tells you how "on-brand" the piece is. Rules that are violated show as inline suggestions.

**Grammarly's tone detector** shows whether the detected tone matches the target brand tone. Tones labeled "on-brand" are encouraged; "off-brand" are flagged. This is a pass/fail quality signal, not a nuanced score.

**Writesonic** uses an SEO content score that updates as you write, showing where coverage is thin.

**Jasper, Copy.ai, Notion AI, Canva** — none provide per-piece quality signals. You read the output and judge for yourself.

### What does not exist (and Ditto should build)

A quality signal that reflects the USER'S quality criteria, not a generic metric. Libby doesn't care about SEO scores. She cares: Does this sound like ME? Would my ideal client connect with this? Is this appropriate for someone who's building (not launching)?

**Recommendation for Ditto:** Each post card should show 2-3 contextual quality signals derived from the user's own knowledge:

- **Voice match** — how well the post reflects the defined brand voice (safe, practical, real)
- **Audience fit** — how well it targets the defined ideal client
- **Self confidence** — how confident the Self is that this post is ready vs. needs human input

These should be visual (colour/icon), not numeric scores. Libby is not a marketer optimising metrics — she needs to feel "this one's strong, that one needs me."

---

## Pattern 3: Editing That Feels Collaborative

**The problem:** Editing AI output feels like correcting a machine. The user becomes a proofreader, not a collaborator.

### What exists today

**ChatGPT Canvas** is the current best-in-class for collaborative AI editing. The dual-pane design (conversation left, document right) lets you highlight text and ask for targeted changes. Shortcut actions (adjust length, change reading level, suggest edits, add polish) make common edits one-click. Version history lets you move between iterations. Reviewers describe it as "more natural than bouncing between chat and a separate editor."

**Claude Artifacts** uses a similar dual-pane model. The key UX difference: you can highlight specific elements in the artifact and click "Improve" to enter a targeted prompt. Claude generates a new version without overriding previous ones. Version arrows let you toggle between iterations.

**Notion AI** achieves the deepest integration. AI features trigger via the same / command used for all Notion blocks. Generated text appears AS a native block — not in a special "AI output" container. Edits show as grey (deleted) and blue (added) text. The AI is a co-author, not a separate system. This visual consistency builds trust precisely because AI content doesn't look different from human content.

**Google Docs + Gemini** uses the familiar Suggested Edits model: inline changes with accept/reject per suggestion, or accept/reject all. Quick actions (rephrase, shorten, elaborate) work on selected text.

**Copy.ai** offers Rewrite and Improve actions on generated content — "Rewrite" gives alternative versions, "Improve" enhances clarity and quality.

**Canva Magic Write** offers Rewrite/More Formal/More Casual but reviewers found these shallow — "just replaced words with complex synonyms."

### The spectrum of editing models

| Model | Tool | Feeling | Risk |
|-------|------|---------|------|
| **Inline diff** (accept/reject per change) | Google Docs, Notion | Reviewing a colleague's track changes | Can feel like proofreading |
| **Dual-pane** (chat + document) | Canvas, Claude, Copy.ai | Working alongside someone | Conversation can dominate |
| **Quick actions** (rephrase, shorten, elaborate) | Canvas, Google Docs, Notion | Directing a collaborator | Limited to predefined actions |
| **Highlight-and-prompt** (select text, type instruction) | Canvas, Claude | Pointing at something and explaining | Requires prompt-writing skill |
| **Regenerate** (full re-do) | Jasper, Copy.ai | "Try again" | Loses any good parts |
| **Version toggle** (arrows between iterations) | Claude, Canvas | Browsing drafts from a colleague | No granular control |

### What Ditto should do differently

For Libby reviewing 5 Instagram posts, the editing model must be:

1. **Per-post, not per-word.** She's reviewing 5 discrete pieces, not a document. Each post is a card she can act on independently.
2. **Direct edit + explain.** She should be able to type directly into the post AND tell the Self what she wants changed ("make this warmer" or "my clients wouldn't say 'postpartum' — they say 'after baby'"). Both inputs feed back into the Self's learning.
3. **Edits teach the Self.** When Libby changes "postpartum" to "after baby," the Self should recognise this as a vocabulary preference and offer to update the brand voice. The edit is not just fixing this post — it's improving all future posts.

**Recommendation for Ditto:** Card-based editing. Each post is a card. The card has: direct-edit mode (click and type), a small prompt field ("tell me what to change"), quick actions (warmer / shorter / more personal / different angle), and regenerate. When the user edits, the Self offers: "I noticed you changed X to Y — should I remember this for future content?"

---

## Pattern 4: Not Feeling Like "Reviewing AI Output"

**The problem:** The moment content appears in a special "AI generated" container with a robot icon, the user shifts into critic mode. They're looking for flaws, not building on strengths.

### What exists today

**Notion AI** is the gold standard for naturalization. AI-generated text appears as native Notion blocks. There are no special containers, gradients, or bot icons. The AI is just another way content enters the page — like typing, pasting, or importing. This framing ("another input method") is the single most effective trust-builder observed across all tools.

**ChatGPT Canvas** partially achieves this — the document pane looks like a normal editor. But the left pane is still a chat with a bot, which anchors the "AI" framing.

**Jasper's campaign workflow** frames the output as "your campaign" not "AI-generated content." The workflow (brief > generate > iterate > approve) mirrors how a human content team works. The campaign framing shifts the user from "reviewing AI" to "reviewing my campaign."

**Most other tools** mark AI output explicitly. Copy.ai has a chat interface with generated content in the response. Canva shows a Magic Write sparkle icon. Grammarly marks every suggestion as AI-generated.

### The framing spectrum

| Framing | Example | User mindset |
|---------|---------|-------------|
| "AI generated this" | Copy.ai chat response | Critic — looking for errors |
| "The tool created this" | Canva Magic Write | Consumer — take it or leave it |
| "Here's your draft" | Jasper campaigns | Editor — refining your work |
| "Here's content on your page" | Notion AI | Author — it's already yours |
| "Here's what we built together" | (none observed) | Collaborator — shared ownership |

### What Ditto should pioneer

The framing should be: **"I drafted these based on what you told me. Which ones feel right?"**

Not "here are 5 AI-generated Instagram posts." Not "review these outputs." But the tone of a colleague who listened to the brief and came back with drafts.

**Recommendation for Ditto:** The output screen should feel like receiving drafts from a team member, not reviewing AI output. Specific moves:

- **No "AI generated" labels.** The Self drafted these. The user already knows the Self is AI — labeling every output reminds them of the machine, not the collaboration.
- **The Self introduces the output conversationally.** "I've drafted 5 posts based on your voice and your audience. Post 3 is the one I'm most confident about — it leans into the 'you're not failing, you're learning' angle your clients respond to. Post 5 is rougher — I'd love your input on the hook."
- **Confidence varies visibly.** Some posts the Self is proud of. Others it flags as needing the user's touch. This asymmetry is what makes it feel like a colleague, not a machine producing uniform output.
- **The user's words are visible in the output context.** The "Based on" section uses the user's own language: "safe, practical, real" — not a system label like "Brand Voice Profile #1."

---

## Pattern 5: Multi-Piece Presentation (Batch Output)

**The problem:** Presenting 5 posts is different from presenting 1 document. The user needs to scan, compare, act on individual pieces, and manage the set.

### What exists today

**Anyword** generates multiple content variants as a vertical list, each with a performance score. Users scan scores, click into pieces, and edit individually.

**Jasper Campaigns** generate multiple content types (email, social, landing page) as a bundle. The output is a single document with sections, downloadable as a package.

**Google Gemini** (in some contexts) generates multiple options side-by-side for comparison.

**Claude** and **ChatGPT** present multiple items inline in the conversation or as a single artifact — no per-item actions.

### What Ditto should build

**Recommendation for Ditto:** A card grid or scrollable card stack, where each post is a discrete card with:

```
┌─────────────────────────────────────────────────┐
│ Post 3 of 5                        ●●● Strong   │
│                                                   │
│ "You don't need to have it all figured out        │
│ before your baby arrives. The best preparation    │
│ isn't buying things — it's knowing you have       │
│ someone in your corner."                          │
│                                                   │
│ #firsttimemum #birthprep #youvegotthis           │
│                                                   │
│ ┌─ Based on ──────────────────────────────────┐  │
│ │ Voice: safe, practical, real                 │  │
│ │ Audience: first-time mums, 30s, professional │  │
│ │ Theme: reassurance + preparation             │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ [Edit]  [Warmer]  [Shorter]  [New angle]  [✓ Use]│
└─────────────────────────────────────────────────┘
```

Key features:
- **Per-card quality indicator** (colour dot + word, not a numeric score — Libby doesn't think in numbers)
- **Collapsible "Based on" section** showing provenance in the user's own words
- **Per-card actions** including direct edit, quick adjustments, and approve/use
- **Set-level actions**: "Use all," "Regenerate weak ones," "Add another"
- **The Self's commentary** appears alongside or above the cards: "Post 3 is the strongest — it hits the reassurance angle. Post 5 needs a better hook. Want me to try a different opening?"

---

## Surprising Findings

1. **Nobody does provenance well.** Not one tool surveyed shows "this output was generated using these specific knowledge inputs" in a user-facing way. Jasper's Knowledge Base is the infrastructure but the UX doesn't surface it per-output. This is Ditto's biggest opportunity.

2. **Anyword's per-piece scoring is powerful but wrong for Ditto's audience.** A 0-100 performance prediction score is perfect for conversion-focused marketers. For Libby, a qualitative signal ("strong / needs you / rough draft") is more appropriate. The PATTERN (per-piece quality metadata) is right; the EXPRESSION (numeric score) is wrong.

3. **Notion's "naturalization" is the most effective trust-builder.** By making AI content look identical to human content, Notion eliminates the "reviewing AI" framing entirely. Ditto can't fully copy this (the output IS from the Self, and that relationship is valuable), but the principle — don't put AI output in a special ghetto — is critical.

4. **ChatGPT Canvas and Claude Artifacts solve for single documents, not content sets.** Their editing UX is excellent for one piece. But Libby has 5 posts. The card-based batch model is underserved in the market.

5. **"Edits as teaching" is almost entirely absent.** No tool surveyed treats user edits as learning opportunities. When you change a word in Jasper, it changes that word. It doesn't ask "should I remember this preference?" Ditto's edit-as-feedback loop (Insight-083) is genuinely novel.

6. **Writer.com's compliance score is the closest model to "voice match."** A single number showing how well content matches brand rules. But it's designed for human writers checking their own work, not for AI output review. Adapting this as a "voice match" indicator on AI-generated content cards is a natural extension.

---

## Recommendations Summary

### Adopt

| Pattern | Source | How to adapt for Ditto |
|---------|--------|----------------------|
| Per-piece quality metadata panel | Anyword | Qualitative indicators (strong / needs you / rough) instead of numeric scores. Use colour dots, not numbers. |
| Compliance/voice score concept | Writer.com, Grammarly | "Voice match" indicator per card showing alignment with user's defined brand voice. Visual, not numeric. |
| Dual-pane (artifact + conversation) | ChatGPT Canvas, Claude | The Self's commentary alongside the content cards. Self introduces, explains confidence, invites editing. |
| Quick actions on content | Canvas, Google Docs, Notion | Per-card actions: warmer, shorter, more personal, different angle. One-tap refinements. |
| Naturalized content appearance | Notion AI | Content cards should look like content, not "AI output." No robot icons, no "generated by AI" labels. |
| Version history per piece | Claude Artifacts | Each card tracks its versions. User can toggle back to a previous draft after editing. |
| Campaign-as-workflow framing | Jasper | Frame the batch as "your content plan" not "AI-generated posts." |

### Build (novel to Ditto)

| Pattern | Why it matters |
|---------|---------------|
| **"Based on" provenance section** per output | No tool does this. Shows the user their own knowledge flowing into outputs. Core trust mechanism. |
| **Edit-as-teaching** feedback loop | When user edits, Self offers to learn the preference. Edits improve future output, not just current piece. |
| **Self confidence variance** across a batch | Some pieces the Self is proud of, others it flags as needing help. Asymmetry makes it feel like a colleague, not a machine. |
| **Card-based batch review** with per-card actions | The market solves for single-document editing. Ditto solves for reviewing a set of discrete content pieces. |
| **User-language provenance** | "Based on" uses the user's words ("safe, practical, real"), not system labels ("Brand Voice Profile"). |

### Avoid

| Anti-pattern | Why | Seen in |
|-------------|-----|---------|
| Numeric scores for non-marketers | Libby doesn't think in performance scores. Numbers create anxiety, not confidence. | Anyword, Writesonic |
| "AI Generated" labels on output | Reminds user they're reviewing a machine, not collaborating with a colleague. | Canva, Copy.ai |
| Single-document editor for batch content | Forces linear review of discrete pieces. Cards are the right unit. | Jasper, Canvas, Claude |
| Regenerate-all as the primary iteration | Loses good parts along with bad. Per-card regeneration preserves what works. | Jasper, Copy.ai |
| Rigid compliance enforcement | Writer.com's red/green rule enforcement feels like a test. For a doula building her brand, guidance should feel like support, not grading. | Writer.com |
| Shallow rewrite actions | "More Formal" that just swaps synonyms teaches the user not to trust quick actions. Each action must produce meaningfully different output. | Canva Magic Write |

---

## Design Principles for Ditto's First Output Review

1. **Provenance is the trust mechanism.** Every output traces back to the user's own words and knowledge. This is what makes Ditto different from ChatGPT.

2. **Quality signals are qualitative, not quantitative.** Colour dots and words (strong / needs you / rough draft), not scores. The user is a business owner, not an analyst.

3. **The card is the unit.** Each content piece is a discrete card with its own quality signal, provenance, actions, and version history. The batch is a collection of cards, not a document.

4. **The Self has opinions.** It introduces the batch with commentary — which pieces it's confident about, which need the user's touch, and why. This asymmetry is what makes it feel like a colleague.

5. **Edits flow back.** Every user edit is a potential learning moment. The Self notices patterns in edits and offers to codify them as knowledge. Editing is not fixing — it's collaborating.

6. **Content looks like content.** No special AI containers. The posts look like Instagram posts. The Self's commentary is clearly the Self, but the content is clearly content.

---

## Sources

- [Jasper AI Brand Voice](https://www.jasper.ai/brand-voice)
- [Jasper Brand IQ](https://www.jasper.ai/brand-iq)
- [Copy.ai Review](https://reply.io/blog/copy-ai-review/)
- [Writer.com Style Guide](https://writer.com/product/style-guide/)
- [Writer.com Brand Voice Review](https://www.atomwriter.com/blog/writer-com-brand-voice-style-guide-review/)
- [Notion AI Inline Guide](https://www.eesel.ai/blog/notion-ai-inline)
- [How Notion Uses Visual Design for AI Adoption](https://medium.com/design-bootcamp/how-notion-utilize-visual-and-perceptual-design-principles-to-to-increase-new-ai-features-adoption-82e7f0dfcc4e)
- [Canva Magic Write](https://www.canva.com/magic-write/)
- [ChatGPT Canvas Review](https://skywork.ai/blog/chatgpt-canvas-review-2025-features-coding-pros-cons/)
- [Introducing Canvas (OpenAI)](https://openai.com/index/introducing-canvas/)
- [Claude Artifacts Guide](https://albato.com/blog/publications/how-to-use-claude-artifacts-guide)
- [Grammarly Brand Tones](https://www.grammarly.com/business/brand-tones)
- [Anyword Predictive Performance Score](https://support.anyword.com/what-is-the-predictive-performance-score)
- [Anyword Scoring & Analytics](https://www.anyword.com/blog/anywords-scoring-analytics)
- [Typeface AI Brand Voice](https://www.typeface.ai/blog/using-ai-for-consistent-brand-voice)
- [Writesonic Content Optimization](https://docs.writesonic.com/docs/content-optimization)
- [Google Docs Gemini](https://support.google.com/docs/answer/13447609)
- [GenAI UX Patterns (UX Collective)](https://uxdesign.cc/20-genai-ux-patterns-examples-and-implementation-tactics-5b1868b7d4a1)
- [AI UX Patterns](https://www.aiuxpatterns.com/)
- [Shape of AI](https://www.shapeof.ai)
- [Fix It, Tweak It, Transform It (Medium)](https://medium.com/ui-for-ai/fix-it-tweak-it-transform-it-a-new-way-to-refine-ai-generated-content-dc53fd9d431f)
