/**
 * Ditto — View metadata contract
 *
 * Each view exposes static meta (scope label, placeholder, starter pills)
 * that the universal chatbar + intent router consume. Rendering is owned
 * by the view's React component; the workspace shell wires up data +
 * context.
 */

export type ViewId =
  | "today"
  | "inbox"
  | "work"
  | "projects"
  | "agents"
  | "people"
  | "settings";

export interface ViewMeta {
  id: ViewId;
  title: string;
  /** Capitalised scope label — feeds the scope pill + placeholder. */
  scope: string;
  /** Placeholder for the universal chatbar on this view. */
  placeholder: string;
  /** Starter prompts shown inside a scoped split chat when empty. */
  starters: string[];
}

export const VIEW_META: Record<ViewId, ViewMeta> = {
  today: {
    id: "today",
    title: "Today",
    scope: "Today",
    placeholder: "Ask Alex about today…",
    starters: [
      "What needs me today?",
      "Show me what you handled overnight",
      "Is anything drifting off track?",
    ],
  },
  inbox: {
    id: "inbox",
    title: "Inbox",
    scope: "Inbox",
    placeholder: "Ask Alex about the queue…",
    starters: [
      "What’s the most urgent?",
      "Summarise everything in the queue",
      "What’s the right order to clear these?",
    ],
  },
  work: {
    id: "work",
    title: "Work",
    scope: "Work",
    placeholder: "Ask Alex about your work…",
    starters: [
      "What’s on fire?",
      "What can I close out in 10 minutes?",
      "Reorder by what actually matters",
    ],
  },
  projects: {
    id: "projects",
    title: "Projects",
    scope: "Projects",
    placeholder: "Ask Alex about your projects…",
    starters: [
      "Which project is most at risk?",
      "What would you pull focus onto?",
    ],
  },
  agents: {
    id: "agents",
    title: "Agents",
    scope: "Agents",
    placeholder: "Ask Alex about your agents…",
    starters: [
      "Which agent should I trust next?",
      "What’s drifting?",
      "Help me train the follow-ups one",
    ],
  },
  people: {
    id: "people",
    title: "People",
    scope: "People",
    placeholder: "Ask Alex about someone…",
    starters: [
      "Who should I reach out to this week?",
      "Remind me what you remember about them",
      "Anyone cooling off?",
    ],
  },
  settings: {
    id: "settings",
    title: "Settings",
    scope: "Settings",
    placeholder: "Ask Alex about settings…",
    starters: [
      "How do I change Alex’s tone?",
      "What integrations do I need?",
    ],
  },
};
