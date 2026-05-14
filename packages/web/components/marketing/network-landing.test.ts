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

  it("communicates the superconnector thesis in the first viewport", () => {
    expect(surfaceASource).toMatch(/superconnector/i);
  });

  it("names economic outcomes in product copy (Brief 271 AC 1a)", () => {
    expect(surfaceASource).toMatch(/work|hires|funding|partnerships|advice|collaborators/);
    expect(surfaceASource).toMatch(/introductions/);
  });

  it("presents the four entry jobs", () => {
    expect(surfaceASource).toContain("Help Ditto understand me");
    expect(surfaceASource).toContain("Find someone now");
    expect(surfaceASource).toContain("Create a request");
    expect(surfaceASource).toContain("Keep watch for me");
  });

  it("distinguishes manual search from background watch", () => {
    expect(surfaceASource).toContain("Manual search");
    expect(surfaceASource).toContain("Background watch");
    expect(surfaceASource).toContain("Watching quietly");
  });

  it("uses the copy doctrine (possible connection / request / source / ask if they are open / watching quietly)", () => {
    expect(surfaceASource).toMatch(/possible connection/i);
    expect(surfaceASource).toContain("Source:");
    expect(surfaceASource).toContain("ask if they are open");
    expect(surfaceASource).toContain("Watching quietly");
  });

  it("avoids marketplace / recruiting / lead-gen framing", () => {
    expect(surfaceASource).not.toMatch(/\b(lead database|leads pipeline|recruiter|recruiting platform|candidate pipeline|talent marketplace)\b/i);
  });

  it("preserves existing direct lane links via mode=expert and mode=client (AC 8)", () => {
    expect(surfaceASource).toContain("/network/chat?mode=expert");
    expect(surfaceASource).toContain("/network/chat?mode=client");
  });

  it("tracks the network_entry_selected event with one of four canonical intents (AC 7)", () => {
    const landingSource = read("packages/web/components/marketing/network-landing.tsx");
    expect(landingSource).toContain("network_entry_selected");
    expect(landingSource).toContain("member-signal");
    expect(landingSource).toContain("manual-search");
    expect(landingSource).toContain('"request"');
    expect(landingSource).toContain("background-watch");
  });

  it("uses the empty/loading state language system (AC 10)", () => {
    expect(surfaceASource).toContain("Reading sources");
    expect(surfaceASource).toContain("Drafting signal");
    expect(surfaceASource).toContain("Watch active");
    expect(surfaceASource).toContain("Needs approval");
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

  it("normalizes the entry intent in the chat page server component (AC 7, AC 8)", () => {
    const chatPageSource = read("packages/web/app/network/chat/page.tsx");
    const intentLibSource = read("packages/web/lib/network-entry-intent.ts");
    expect(chatPageSource).toContain("normalizeIntent");
    expect(chatPageSource).toContain("initialIntent");
    expect(chatPageSource).toContain("isNetworkEntryIntent");
    expect(intentLibSource).toContain('"member-signal"');
    expect(intentLibSource).toContain('"manual-search"');
    expect(intentLibSource).toContain('"request"');
    expect(intentLibSource).toContain('"background-watch"');
  });

  it("fires network_entry_selected from the chat shell only when intent is explicit in the URL (no mode-toggle pollution)", () => {
    const chatPageSource = read("packages/web/app/network/chat/page.tsx");
    const modeToggleSource = read("packages/web/app/network/chat/mode-toggle.tsx");
    // page.tsx must return undefined intent when the URL param is missing/invalid.
    expect(chatPageSource).toMatch(/NetworkEntryIntent \| undefined/);
    // mode-toggle must NOT re-stamp intent on navigation, or the shell's
    // mount-effect will re-fire `network_entry_selected` on every toggle.
    // Assert against the actual router.push template, not free-form comments.
    expect(modeToggleSource).toMatch(/router\.push\(`\/network\/chat\?mode=\$\{next\}`\)/);
    expect(modeToggleSource).not.toMatch(/router\.push\([^)]*intent=/);
  });
});
