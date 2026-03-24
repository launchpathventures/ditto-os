"use server";

import { execFileSync } from "child_process";
import { loadConfig, saveConfig, applyConfigToEnv, type DittoConfig } from "@/lib/config";

/**
 * Check if a CLI tool is available on the system.
 */
export async function detectCli(command: string): Promise<boolean> {
  try {
    execFileSync("which", [command], { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect which CLI tools are available.
 */
export async function detectAvailableClis(): Promise<Record<string, boolean>> {
  const [claude, codex, ollama] = await Promise.all([
    detectCli("claude"),
    detectCli("codex"),
    detectCli("ollama"),
  ]);
  return { claude, codex, ollama };
}

/**
 * Save LLM configuration and apply it.
 */
export async function saveSetup(config: DittoConfig): Promise<{ success: boolean; error?: string }> {
  try {
    saveConfig(config);
    applyConfigToEnv(config);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save configuration",
    };
  }
}

/**
 * Check if the app is configured.
 */
export async function checkConfigured(): Promise<boolean> {
  return loadConfig() !== null;
}

/**
 * Get the current config (without exposing secrets to client).
 */
export async function getConfigSafe(): Promise<{ connection: string; model: string } | null> {
  const config = loadConfig();
  if (!config) return null;
  return { connection: config.connection, model: config.model };
}
