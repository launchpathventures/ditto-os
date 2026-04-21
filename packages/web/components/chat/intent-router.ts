/**
 * Ditto — Universal-bar Intent Router
 *
 * Keyword-first classifier: given a user prompt + the current view's scope,
 * decide whether this question belongs in the current view's chat thread,
 * whether it's a new topic, or whether it's ambiguous and worth asking.
 *
 * An LLM-backed router is the durable answer (as the design handoff calls
 * out) — this keyword pass keeps the interaction loop honest until that
 * lands. Contract stays the same so the swap is a one-liner.
 */

export type Scope =
  | "Today"
  | "Inbox"
  | "Work"
  | "Projects"
  | "Agents"
  | "People"
  | "Settings"
  | (string & {});

export type IntentVerdict = "related" | "new" | "ambiguous";

const SCOPE_KEYWORDS: Record<string, string[]> = {
  Today: ["today", "morning", "brief", "overnight", "now", "this morning"],
  Inbox: ["inbox", "queue", "review", "approve", "pending", "waiting"],
  Work: ["task", "todo", "to-do", "work", "due", "deadline", "doing"],
  Projects: ["project", "pilot", "roadmap", "milestone", "shipping"],
  Agents: ["agent", "routine", "autonomous", "automate", "schedule", "training"],
  People: ["person", "people", "relationship", "contact", "intro"],
  Settings: ["setting", "connect", "integration", "tone", "preference"],
};

const OFF_TOPIC_HINTS = [
  "pricing",
  "hire",
  "fund",
  "series",
  "personal",
  "family",
  "travel",
  "holiday",
  "random",
  "philosophy",
];

/**
 * Classify a free-text prompt against the current view scope.
 *
 *   "related"   — keeps it in the current thread / opens split here
 *   "new"       — off-topic keywords fired but scope keywords did not
 *   "ambiguous" — neither clear; ask the user inline
 */
export function classifyIntent(text: string, scope: Scope): IntentVerdict {
  const t = text.toLowerCase();
  const scopeKws = SCOPE_KEYWORDS[scope] ?? [];
  const hitsScope = scopeKws.some((k) => t.includes(k));
  const offTopic = OFF_TOPIC_HINTS.some((k) => t.includes(k));

  if (hitsScope && !offTopic) return "related";
  if (offTopic && !hitsScope) return "new";
  return "ambiguous";
}
