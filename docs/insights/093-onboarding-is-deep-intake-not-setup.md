# Insight-093: Onboarding Is Deep Intake, Not Setup

**Date:** 2026-03-24
**Trigger:** Architect reality check on Phase 10 MVP brief — onboarding was treated as thin user model extraction
**Layers affected:** L2 Agent (Self), L5 Learning (user model), L6 Human (onboarding UX)
**Status:** active

## The Insight

The Phase 10 briefs treated onboarding as "Self asks questions, extracts business type and pain points, creates first process." This is far too thin. The onboarding conversation is Ditto's most important moment — it's a **white-glove intake process** where the Self deeply learns the user across 9 dimensions:

1. **Problems** — what's broken, what hurts (first process candidates)
2. **Vision** — where they want to be (process roadmap fuel)
3. **Work** — how they actually do things today (process definition accuracy)
4. **Challenges** — what's hard, what fails (where Ditto adds most value)
5. **Concerns** — what worries them about AI/automation (trust calibration from day 1)
6. **Frustrations** — what they've tried that didn't work (what to avoid)
7. **Goals** — short and medium term (proactive suggestion fuel)
8. **Tasks** — what's on their plate right now (immediate value — handle something today)
9. **Communication preferences** — when, how, how much (briefing style, frequency, verbosity)

This isn't a single conversation that ends in 15 minutes. It's a multi-session deepening process. The Self asks the most important things first (problems, tasks — for immediate value) and deepens across sessions (vision, goals, challenges — for strategic guidance).

The user model must be rich enough to power proactive suggestions for weeks, not just route to a first process.

## The Second Dimension: Ditto as AI Coach

Most people are bad at working with AI because no AI has ever taught them how. Ditto must actively help users become better collaborators:

- **Teaching useful correction habits:** "When you tell me *why* you changed the labour estimate, I learn faster than if you just change the number"
- **Setting honest expectations:** "I'll get the first few wrong — that's how I learn your standards"
- **Building confidence:** "You've taught me 4 things about bathroom quotes this week — here's what I know now"
- **Showing the learning:** Making accumulated knowledge visible so the user sees the return on their investment in teaching Ditto
- **Coaching better prompts:** Gently guiding users toward giving Ditto what it needs to produce amazing results, without making them feel they're doing it wrong

This is the flip side of the learning loop. Ditto learns from the user. But the user also needs to learn how to teach Ditto. The Self should be an AI collaboration coach — not by lecturing, but by naturally surfacing these patterns in conversation.

## Implications

1. The user model in Brief 040 needs to be much richer — 9 dimensions, not 3 fields
2. The onboarding flow is multi-session, not a single conversation
3. The Self's proactive suggestions (Brief 043) draw from this deep intake — vision and goals inform coverage gap detection, not just pain points
4. "AI coaching" moments should be woven into the Self's conversation naturally — after corrections, during reviews, when the user gives vague input
5. The workspace should emerge in days (Self proactively creates velocity), not months (passively waiting for volume)

## Where It Should Land

- Brief 040 acceptance criteria for onboarding and user model
- Brief 043 suggestion engine inputs (9 dimensions, not 3)
- Cognitive framework (`cognitive/self.md`) — AI coaching principles
- ADR-016 update — Self as coach, not just delegate
