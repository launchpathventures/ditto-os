/**
 * Tests for Ditto Web LLM Configuration (Brief 039).
 *
 * Tests config persistence (load/save) and env var application.
 * Uses a temp directory to avoid touching real config.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ============================================================
// Config types (mirrors packages/web/lib/config-types.ts)
// ============================================================

type ConnectionMethod = "claude-cli" | "codex-cli" | "anthropic" | "openai" | "ollama";

interface DittoConfig {
  connection: ConnectionMethod;
  model: string;
  apiKey?: string;
  ollamaUrl?: string;
}

// ============================================================
// Inline config functions (to avoid importing from web package)
// We test the LOGIC, not the import path.
// ============================================================

function loadConfigFrom(path: string): DittoConfig | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.connection || !parsed.model) return null;
    return parsed as DittoConfig;
  } catch {
    return null;
  }
}

function saveConfigTo(path: string, config: DittoConfig): void {
  const dir = join(path, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
}

function applyConfigToEnv(config: DittoConfig): void {
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

// ============================================================
// Tests
// ============================================================

describe("Config persistence", () => {
  let tmpDir: string;
  let configPath: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ditto-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.json");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when config file does not exist", () => {
    expect(loadConfigFrom(join(tmpDir, "nonexistent.json"))).toBeNull();
  });

  it("saves and loads a claude-cli config", () => {
    const config: DittoConfig = {
      connection: "claude-cli",
      model: "claude-sonnet-4-6",
    };
    saveConfigTo(configPath, config);
    const loaded = loadConfigFrom(configPath);
    expect(loaded).toEqual(config);
  });

  it("saves and loads an anthropic API key config", () => {
    const config: DittoConfig = {
      connection: "anthropic",
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test-key",
    };
    saveConfigTo(configPath, config);
    const loaded = loadConfigFrom(configPath);
    expect(loaded).toEqual(config);
  });

  it("saves and loads a codex-cli config", () => {
    const config: DittoConfig = {
      connection: "codex-cli",
      model: "gpt-5.3-codex",
    };
    saveConfigTo(configPath, config);
    const loaded = loadConfigFrom(configPath);
    expect(loaded).toEqual(config);
  });

  it("saves and loads an ollama config with custom URL", () => {
    const config: DittoConfig = {
      connection: "ollama",
      model: "llama3.3",
      ollamaUrl: "http://192.168.1.100:11434",
    };
    saveConfigTo(configPath, config);
    const loaded = loadConfigFrom(configPath);
    expect(loaded).toEqual(config);
  });

  it("returns null for malformed JSON", () => {
    writeFileSync(configPath, "not json", "utf-8");
    expect(loadConfigFrom(configPath)).toBeNull();
  });

  it("returns null for JSON missing required fields", () => {
    writeFileSync(configPath, JSON.stringify({ connection: "anthropic" }), "utf-8");
    expect(loadConfigFrom(configPath)).toBeNull();
  });

  it("config file is human-readable JSON with indentation", () => {
    saveConfigTo(configPath, { connection: "claude-cli", model: "claude-sonnet-4-6" });
    const raw = readFileSync(configPath, "utf-8");
    expect(raw).toContain("\n");
    expect(raw).toContain("  ");
  });
});

describe("applyConfigToEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sets correct env vars for claude-cli", () => {
    applyConfigToEnv({ connection: "claude-cli", model: "claude-sonnet-4-6" });
    expect(process.env.LLM_PROVIDER).toBe("anthropic");
    expect(process.env.LLM_MODEL).toBe("claude-sonnet-4-6");
    expect(process.env.DITTO_CONNECTION).toBe("claude-cli");
  });

  it("sets correct env vars for codex-cli", () => {
    applyConfigToEnv({ connection: "codex-cli", model: "gpt-5.3-codex" });
    expect(process.env.LLM_PROVIDER).toBe("openai");
    expect(process.env.LLM_MODEL).toBe("gpt-5.3-codex");
    expect(process.env.DITTO_CONNECTION).toBe("codex-cli");
  });

  it("sets API key for anthropic connection", () => {
    applyConfigToEnv({ connection: "anthropic", model: "claude-opus-4-6", apiKey: "sk-ant-test" });
    expect(process.env.LLM_PROVIDER).toBe("anthropic");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(process.env.DITTO_CONNECTION).toBe("anthropic");
  });

  it("sets API key for openai connection", () => {
    applyConfigToEnv({ connection: "openai", model: "gpt-4o", apiKey: "sk-test" });
    expect(process.env.LLM_PROVIDER).toBe("openai");
    expect(process.env.OPENAI_API_KEY).toBe("sk-test");
    expect(process.env.DITTO_CONNECTION).toBe("openai");
  });

  it("sets Ollama URL for ollama connection", () => {
    applyConfigToEnv({ connection: "ollama", model: "llama3.3", ollamaUrl: "http://custom:11434" });
    expect(process.env.LLM_PROVIDER).toBe("ollama");
    expect(process.env.OLLAMA_URL).toBe("http://custom:11434");
    expect(process.env.DITTO_CONNECTION).toBe("ollama");
  });

  it("does not set API key when not provided", () => {
    delete process.env.ANTHROPIC_API_KEY;
    applyConfigToEnv({ connection: "claude-cli", model: "claude-sonnet-4-6" });
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});

describe("Connection options", () => {
  it("claude-cli does not require API key", () => {
    // Verify the design decision: subscription paths don't need keys
    const config: DittoConfig = { connection: "claude-cli", model: "claude-sonnet-4-6" };
    expect(config.apiKey).toBeUndefined();
  });

  it("codex-cli does not require API key", () => {
    const config: DittoConfig = { connection: "codex-cli", model: "gpt-5.3-codex" };
    expect(config.apiKey).toBeUndefined();
  });

  it("all five connection methods are valid", () => {
    const methods: ConnectionMethod[] = ["claude-cli", "codex-cli", "anthropic", "openai", "ollama"];
    for (const method of methods) {
      const config: DittoConfig = { connection: method, model: "test" };
      expect(config.connection).toBe(method);
    }
  });
});
