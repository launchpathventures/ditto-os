/**
 * Ditto Web — LLM Configuration Types (client-safe)
 *
 * Types and static data for the setup UI.
 * No server imports (fs, path) — safe for client components.
 */

// ============================================================
// Types
// ============================================================

export type ConnectionMethod =
  | "claude-cli"
  | "codex-cli"
  | "anthropic"
  | "openai"
  | "ollama";

export interface DittoConfig {
  connection: ConnectionMethod;
  model: string;
  apiKey?: string;
  ollamaUrl?: string;
}

export interface ConnectionOption {
  id: ConnectionMethod;
  name: string;
  description: string;
  requiresApiKey: boolean;
  models: Array<{ id: string; name: string; recommended?: boolean }>;
  detectCommand?: string;
}

// ============================================================
// Available connection methods
// ============================================================

export const CONNECTION_OPTIONS: ConnectionOption[] = [
  {
    id: "claude-cli",
    name: "Claude subscription",
    description: "Use your Claude Pro or Max subscription via the Claude CLI. No API key needed.",
    requiresApiKey: false,
    detectCommand: "claude",
    models: [
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", recommended: true },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    ],
  },
  {
    id: "codex-cli",
    name: "OpenAI subscription",
    description: "Use your ChatGPT or Codex subscription via the Codex CLI. No API key needed.",
    requiresApiKey: false,
    detectCommand: "codex",
    models: [
      { id: "gpt-5.3-codex", name: "GPT-5.3 Codex", recommended: true },
      { id: "o3", name: "o3" },
      { id: "gpt-4o", name: "GPT-4o" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic API key",
    description: "Pay-per-use with your own Anthropic API key.",
    requiresApiKey: true,
    models: [
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", recommended: true },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI API key",
    description: "Pay-per-use with your own OpenAI API key.",
    requiresApiKey: true,
    models: [
      { id: "gpt-4o", name: "GPT-4o", recommended: true },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "o3-mini", name: "o3-mini" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    description: "Run models locally for free. Requires Ollama to be installed and running.",
    requiresApiKey: false,
    models: [
      { id: "llama3.3", name: "Llama 3.3", recommended: true },
      { id: "qwen3", name: "Qwen 3" },
      { id: "mistral", name: "Mistral" },
    ],
  },
];
