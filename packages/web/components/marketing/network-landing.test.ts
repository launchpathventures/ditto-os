import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("network landing source contract", () => {
  const surfaceASource = [
    "packages/web/app/network/page.tsx",
    "packages/web/components/marketing/network-landing.tsx",
    "packages/web/components/marketing/network-card-preview.tsx",
  ].map(read).join("\n");

  it("keeps Surface A persona-neutral", () => {
    expect(surfaceASource).not.toMatch(/\b(Alex|Mira|Greeter)\b/);
  });

  it("does not reintroduce marketing-page sections", () => {
    expect(surfaceASource).not.toMatch(
      /\b(How it works|FAQ|Who.*already here|Testimonial|Pricing|Compare|Features)\b/i,
    );
  });

  it("honors reduced motion for the cycling preview", () => {
    expect(surfaceASource).toContain("prefers-reduced-motion: reduce");
    expect(surfaceASource).toContain("window.setInterval");
  });

  it("uses the Instrument Serif utility on the headline verb", () => {
    expect(surfaceASource).toContain("font-instrument-serif");
  });

  it("does not treat seeded expert/client lane sessions as Turnstile-verified chat sessions", () => {
    const chatRouteSources = [
      "packages/web/app/api/v1/network/chat/route.ts",
      "packages/web/app/api/v1/network/chat/stream/route.ts",
    ].map(read);

    for (const source of chatRouteSources) {
      expect(source).toContain('existing.context !== "expert"');
      expect(source).toContain('existing.context !== "client"');
    }
  });

  it("threads verified identity and rate limiting through the lane bootstrap route", () => {
    const laneRouteSource = read(
      "packages/web/app/api/v1/network/chat/lane/route.ts",
    );
    const chatShellSource = read(
      "packages/web/app/network/chat/network-chat-shell.tsx",
    );

    expect(laneRouteSource).toContain("ditto_chat_session");
    expect(laneRouteSource).toContain("sourceSessionId");
    expect(laneRouteSource).toContain("checkNetworkLaneOpenRateLimit");
    expect(laneRouteSource).toContain("authenticatedEmail");
    expect(chatShellSource).toContain("ditto-chat-session");
    expect(chatShellSource).toContain("sourceSessionId");
  });
});
