/**
 * Voice Channel Adapter Tests (Brief 142b)
 *
 * Tests the VoiceChannelAdapter implementation.
 */

import { describe, it, expect } from "vitest";
import { VoiceChannelAdapter, createVoiceAdapter } from "./channel";

describe("VoiceChannelAdapter", () => {
  it("has channel type 'voice'", () => {
    const adapter = new VoiceChannelAdapter();
    expect(adapter.channel).toBe("voice");
  });

  it("send returns not supported for v1", async () => {
    const adapter = new VoiceChannelAdapter();
    const result = await adapter.send({
      to: "+1234567890",
      body: "Hello",
      personaId: "alex",
      mode: "connecting",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("v1");
  });

  it("search returns empty array for v1", async () => {
    const adapter = new VoiceChannelAdapter();
    const result = await adapter.search("test");
    expect(result).toEqual([]);
  });
});

describe("createVoiceAdapter", () => {
  it("returns null when ELEVENLABS_API_KEY is not set", () => {
    const original = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    const adapter = createVoiceAdapter();
    expect(adapter).toBeNull();
    if (original) process.env.ELEVENLABS_API_KEY = original;
  });

  it("returns adapter when ELEVENLABS_API_KEY is set", () => {
    const original = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
    const adapter = createVoiceAdapter();
    expect(adapter).toBeInstanceOf(VoiceChannelAdapter);
    if (original) {
      process.env.ELEVENLABS_API_KEY = original;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  });
});
