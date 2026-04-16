/**
 * Ditto — Composition Empty States (Brief 073)
 *
 * Empty state block factories per intent. Each returns ContentBlock[]
 * with TextBlock + ActionBlock + SuggestionBlock per the brief spec.
 *
 * Extracted from composition functions for clarity. Empty states are
 * the first thing a new user sees — they must be clear and actionable.
 *
 * Provenance: Brief 073 (Composition Intent Activation), Linear app empty states (pattern).
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext, ProcessCapability } from "./compositions/types";

/**
 * Today empty state — greeting + "What would you like to work on?" + suggestions.
 * Brief 168 AC6: Adds matched capability to suggestions when available.
 */
export function emptyToday(greeting: string, recommended?: ProcessCapability[]): ContentBlock[] {
  const blocks: ContentBlock[] = [
    {
      type: "text",
      text: `${greeting}. Alex isn\u2019t working for you yet.`,
      variant: "hero-primary",
    },
    {
      type: "actions",
      actions: [
        {
          id: "empty-today-start",
          label: "Tell Alex what you do",
          style: "primary",
          payload: { intentContext: "today" },
        },
      ],
    },
  ];

  // Brief 168: Insert top recommendation before generic suggestions
  if (recommended && recommended.length > 0) {
    const topRec = recommended[0];
    blocks.push({
      type: "suggestion",
      content: topRec.name,
      reasoning: topRec.matchReason || topRec.description,
      actions: [
        {
          id: `capability.start.${topRec.slug}`,
          label: "Set this up",
          style: "primary",
          payload: { templateId: topRec.slug, templateName: topRec.name },
        },
      ],
    });
  }

  blocks.push(
    {
      type: "suggestion",
      content: "Find me more clients",
      reasoning: "Tell Alex about your business and who you sell to. He\u2019ll find prospects, draft outreach, and handle follow-ups.",
      actions: [
        {
          id: "empty-today-start-outreach",
          label: "Find me clients",
          style: "primary",
          payload: { intentContext: "today", action: "start-outreach" },
        },
      ],
    },
    {
      type: "suggestion",
      content: "Introduce me to the right people",
      reasoning: "Alex will research who you should meet and reach out on your behalf. Real introductions, not spam.",
      actions: [
        {
          id: "empty-today-start-networking",
          label: "Make introductions",
          payload: { intentContext: "today", action: "start-networking" },
        },
      ],
    },
    {
      type: "suggestion",
      content: "Help me stay on top of things",
      reasoning: "Alex will send you daily briefings with what needs your attention, what\u2019s waiting, and what\u2019s next.",
      actions: [
        {
          id: "empty-today-briefing",
          label: "Keep me on top of things",
          payload: { intentContext: "today", action: "start-briefing" },
        },
      ],
    },
  );

  return blocks;
}

/**
 * Inbox empty state — "Nothing needs your attention" + explanation.
 */
export function emptyInbox(): ContentBlock[] {
  return [
    {
      type: "text",
      text: "All clear. Nothing needs your review.",
      variant: "hero-primary",
    },
    {
      type: "text",
      text: "When Alex has outreach drafts, intros, or briefings ready for you, they\u2019ll appear here.",
    },
    {
      type: "suggestion",
      content: "Tell Alex what you do to get started.",
      reasoning: "Once Alex is working for you, anything that needs your approval shows up here.",
      actions: [
        {
          id: "empty-inbox-get-started",
          label: "Get started",
          payload: { intentContext: "inbox", action: "get-started" },
        },
      ],
    },
  ];
}

/**
 * Work empty state — "No active work" + "What do you need to get done?" + suggestions.
 */
export function emptyWork(): ContentBlock[] {
  return [
    {
      type: "text",
      text: "No active work.",
      variant: "hero-primary",
    },
    {
      type: "actions",
      actions: [
        {
          id: "empty-work-start",
          label: "What do you need to get done?",
          style: "primary",
          payload: { intentContext: "work" },
        },
      ],
    },
    {
      type: "suggestion",
      content: "Create a task",
      reasoning: "Capture something you need to do and track it here.",
      actions: [
        {
          id: "empty-work-create-task",
          label: "Create a task",
          style: "primary",
          payload: { intentContext: "work", action: "create-task" },
        },
      ],
    },
    {
      type: "suggestion",
      content: "Set a goal",
      reasoning: "Goals break down into tasks that Ditto tracks for you.",
      actions: [
        {
          id: "empty-work-set-goal",
          label: "Set a goal",
          payload: { intentContext: "work", action: "set-goal" },
        },
      ],
    },
  ];
}

/**
 * Projects empty state — "No projects yet" + "Start a project" + explanation.
 */
export function emptyProjects(): ContentBlock[] {
  return [
    {
      type: "text",
      text: "No projects yet.",
      variant: "hero-primary",
    },
    {
      type: "actions",
      actions: [
        {
          id: "empty-projects-start",
          label: "Start a project",
          style: "primary",
          payload: { intentContext: "projects" },
        },
      ],
    },
    {
      type: "text",
      text: "Projects group related work, processes, and goals together.",
    },
    {
      type: "suggestion",
      content: "Describe a larger goal and Ditto will break it down.",
      actions: [
        {
          id: "empty-projects-describe",
          label: "Start a project",
          style: "primary",
          payload: { intentContext: "projects", action: "start-project" },
        },
      ],
    },
  ];
}

/**
 * Routines empty state — "No routines yet" + "Create a routine" + explanation.
 */
export function emptyRoutines(): ContentBlock[] {
  return [
    {
      type: "text",
      text: "Alex isn\u2019t running anything for you yet.",
      variant: "hero-primary",
    },
    {
      type: "actions",
      actions: [
        {
          id: "empty-routines-create",
          label: "Get Alex working",
          style: "primary",
          payload: { intentContext: "routines" },
        },
      ],
    },
    {
      type: "text",
      text: "When Alex is working for you, his ongoing tasks show up here \u2014 outreach, intros, follow-ups, briefings.",
    },
    {
      type: "suggestion",
      content: "Tell Alex what you do and who you need to reach. He\u2019ll figure out the rest.",
      reasoning: "Alex handles the legwork \u2014 finding people, drafting messages, following up. You approve everything at first.",
      actions: [
        {
          id: "empty-routines-describe",
          label: "Get started",
          payload: { intentContext: "routines", action: "get-started" },
        },
      ],
    },
  ];
}

/**
 * Growth empty state — "No growth plans yet" + suggest creating via conversation (Brief 140).
 */
export function emptyGrowth(): ContentBlock[] {
  return [
    {
      type: "text",
      text: "Alex isn\u2019t finding you clients yet.",
      variant: "hero-primary",
    },
    {
      type: "suggestion",
      content: "Tell me what you do and who your ideal client is.",
      reasoning: "Alex will find prospects, draft outreach in your voice, and handle follow-ups. You approve everything before it goes out.",
      actions: [
        {
          id: "empty-growth-start",
          label: "Find me clients",
          style: "primary",
          payload: { intentContext: "growth", action: "start-growth" },
        },
      ],
    },
    {
      type: "suggestion",
      content: "Describe the kind of customer you want more of.",
      reasoning: "Alex will find people like your best customers and reach out on your behalf. Nothing goes out without your sign-off.",
      actions: [
        {
          id: "empty-growth-describe",
          label: "Describe my ideal client",
          payload: { intentContext: "growth", action: "describe-product" },
        },
      ],
    },
  ];
}

/**
 * Library empty state — loading or no templates found.
 * Brief 168 AC6: Context-aware when user model + recommendations available.
 */
export function emptyLibrary(context?: Pick<CompositionContext, "recommended">): ContentBlock[] {
  // Brief 168: Context-aware empty state with matched capabilities
  if (context?.recommended && context.recommended.length > 0) {
    const blocks: ContentBlock[] = [
      {
        type: "text",
        text: "Based on what I know about your business, here\u2019s what would help most.",
        variant: "hero-primary",
      },
    ];

    for (const cap of context.recommended.slice(0, 3)) {
      blocks.push({
        type: "record",
        title: cap.name,
        subtitle: cap.matchReason || cap.description,
        status: { label: "Recommended", variant: "vivid" },
        fields: [
          { label: "Type", value: cap.type === "cycle" ? "Continuous" : "On-demand" },
        ],
        actions: [
          {
            id: `capability.start.${cap.slug}`,
            label: "Start this",
            style: "primary",
            payload: { templateId: cap.slug, templateName: cap.name },
          },
        ],
      });
    }

    return blocks;
  }

  // Generic empty state — no user model
  return [
    {
      type: "text",
      text: "Here\u2019s what Alex can do for you.",
      variant: "hero-primary",
    },
    {
      type: "suggestion",
      content: "Ask me what I can help with.",
      reasoning: "Alex finds clients, makes introductions, handles follow-ups, and sends you daily briefings \u2014 all customised to your business.",
      actions: [
        {
          id: "empty-library-ask",
          label: "What can you do?",
          style: "primary",
          payload: { intentContext: "library", action: "ask-capabilities" },
        },
      ],
    },
  ];
}

/**
 * Roadmap empty state — "Create a project first" + "Start a project".
 */
export function emptyRoadmap(): ContentBlock[] {
  return [
    {
      type: "text",
      text: "Create a project first to see your roadmap.",
      variant: "hero-primary",
    },
    {
      type: "actions",
      actions: [
        {
          id: "empty-roadmap-start",
          label: "Start a project",
          style: "primary",
          payload: { intentContext: "roadmap" },
        },
      ],
    },
    {
      type: "suggestion",
      content: "Projects and their milestones appear here as a roadmap once created.",
      actions: [
        {
          id: "empty-roadmap-start-project",
          label: "Start a project",
          payload: { intentContext: "roadmap", action: "start-project" },
        },
      ],
    },
  ];
}
