/**
 * Ditto Web — LLM Configuration (server-only)
 *
 * Persists LLM provider configuration to data/config.json.
 * Read at startup, written from the setup page.
 * No DB dependency — this bootstraps before the DB exists.
 *
 * IMPORTANT: This module uses `fs` and must only be imported server-side.
 * For client components, use config-types.ts instead.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { ConnectionMethod, DittoConfig } from "./config-types";
import { DATA_DIR } from "../../../src/paths.js";

// Re-export types for server consumers
export type { ConnectionMethod, DittoConfig } from "./config-types";

// ============================================================
// Config persistence
// ============================================================

const CONFIG_PATH = join(DATA_DIR, "config.json");

export function loadConfig(): DittoConfig | null {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.connection && parsed.model) return parsed as DittoConfig;
    }
  } catch {
    // Fall through to env-based config below.
  }
  // Fallback for provisioned/managed workspaces: the setup wizard may never
  // have run (so config.json is absent), and on Railway DATA_DIR lives on the
  // ephemeral image filesystem rather than the mounted volume — a written
  // config.json would not survive a redeploy. Build config directly from the
  // LLM env vars the provisioner/operator sets.
  return configFromEnv();
}

/** Build a DittoConfig from environment when no config.json is present. */
function configFromEnv(): DittoConfig | null {
  const model = process.env.LLM_MODEL?.trim();
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      connection: "anthropic",
      model: model || "claude-sonnet-4-6",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      connection: "openai",
      model: model || "gpt-4o",
      apiKey: process.env.OPENAI_API_KEY,
    };
  }
  return null;
}

export function saveConfig(config: DittoConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function isConfigured(): boolean {
  // Mock LLM mode: skip config check (Brief 054 — e2e testing)
  if (process.env.MOCK_LLM === "true") return true;
  return loadConfig() !== null;
}

/**
 * Apply config to process.env so the engine picks it up.
 * Called at runtime before engine functions are used.
 */
export function applyConfigToEnv(config: DittoConfig): void {
  switch (config.connection) {
    case "claude-cli":
      process.env.LLM_PROVIDER = "anthropic";
      process.env.LLM_MODEL = config.model;
      process.env.DITTO_CONNECTION = "claude-cli";
      break;
    case "codex-cli":
      process.env.LLM_PROVIDER = "openai";
      process.env.LLM_MODEL = config.model;
      process.env.DITTO_CONNECTION = "codex-cli";
      break;
    case "anthropic":
      process.env.LLM_PROVIDER = "anthropic";
      process.env.LLM_MODEL = config.model;
      if (config.apiKey) process.env.ANTHROPIC_API_KEY = config.apiKey;
      process.env.DITTO_CONNECTION = "anthropic";
      break;
    case "openai":
      process.env.LLM_PROVIDER = "openai";
      process.env.LLM_MODEL = config.model;
      if (config.apiKey) process.env.OPENAI_API_KEY = config.apiKey;
      process.env.DITTO_CONNECTION = "openai";
      break;
    case "ollama":
      process.env.LLM_PROVIDER = "ollama";
      process.env.LLM_MODEL = config.model;
      if (config.ollamaUrl) process.env.OLLAMA_URL = config.ollamaUrl;
      process.env.DITTO_CONNECTION = "ollama";
      break;
  }
}
