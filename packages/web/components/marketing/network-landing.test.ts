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
  ].map(read).join("\n");

  it("keeps Surface A persona-neutral", () => {
    expect(surfaceASource).not.toMatch(/\b(Alex|Mira|Greeter)\b/);
  });

  it("does not reintroduce marketing-page sections", () => {
    expect(surfaceASource).not.toMatch(
      /\b(How it works|FAQ|Who.*already here|Testimonial|Pricing|Compare|Features)\b/i,
    );
  });

  it("does not auto-cycle through preview cards", () => {
    expect(surfaceASource).not.toContain("NetworkCardPreview");
    expect(surfaceASource).not.toContain("activeIntent");
  });

  it("keeps rotating prompt ideas inside the input only", () => {
    expect(surfaceASource).toContain("useTypedPrompt");
    expect(surfaceASource).toContain("placeholder={typedPrompt || active.placeholder}");
    expect(surfaceASource).not.toContain("onClick={() => setAnswer(typedPrompt");
  });

  it("uses the Instrument Serif utility on the headline verb", () => {
    expect(surfaceASource).toContain("font-instrument-serif");
  });

  it("communicates the superconnector thesis in the first viewport", () => {
    expect(surfaceASource).toMatch(/superconnector/i);
  });

  it("names economic outcomes in product copy (Brief 271 AC 1a)", () => {
    expect(surfaceASource).toMatch(/work|hires|funding|partnerships|advice|collaborators/);
    expect(surfaceASource).toMatch(/intro/);
  });

  it("presents one Ethos-style composer with two user-side choices", () => {
    expect(surfaceASource).toContain("Create profile");
    expect(surfaceASource).toContain("Research");
    expect(surfaceASource).toContain("Research people and companies");
    expect(surfaceASource).toContain("Who are you trying to find");
    expect(surfaceASource).toContain("What should people come to you for");
    expect(surfaceASource).toContain("Research");
    expect(surfaceASource).toContain("Be found");
    expect(surfaceASource).not.toContain("Make my signal");
    expect(surfaceASource).not.toContain("Create a request");
    expect(surfaceASource).not.toContain("Keep watch");
  });

  it("defaults to manual search and keeps member signal as the expert mode", () => {
    expect(surfaceASource).toContain("manual-search");
    expect(surfaceASource).toContain("member-signal");
  });

  it("uses the copy doctrine (source / approval / asks before intro)", () => {
    expect(surfaceASource).toMatch(/Source-backed/i);
    expect(surfaceASource).toContain("asks before");
    expect(surfaceASource).toContain("approved");
  });

  it("avoids marketplace / recruiting / lead-gen framing", () => {
    expect(surfaceASource).not.toMatch(/\b(lead database|leads pipeline|recruiter|recruiting platform|candidate pipeline|talent marketplace)\b/i);
  });

  it("hands off landing answers to the onboarding routes", () => {
    expect(surfaceASource).toContain('mode: "expert"');
    expect(surfaceASource).toContain('mode: "client"');
    expect(surfaceASource).toContain("/network/request");
    expect(surfaceASource).toContain("/network/signal");
  });

  it("keeps the landing form from submitting empty requests or reloading /network", () => {
    const landingSource = read("packages/web/components/marketing/network-landing.tsx");

    expect(landingSource).toContain("MIN_LANDING_ANSWER_CHARS");
    expect(landingSource).toContain('action={active.href}');
    expect(landingSource).toContain('method="get"');
    expect(landingSource).toContain('name="seed"');
    expect(landingSource).toContain('required');
    expect(landingSource).toContain('minLength={MIN_LANDING_ANSWER_CHARS}');
    expect(landingSource).not.toMatch(/\sdisabled=\{!canSubmit\}/);
    expect(landingSource).not.toContain("aria-disabled");
    expect(landingSource).toContain('data-ready={canSubmit ? "true" : "false"}');
    expect(landingSource).toContain('readAnswerFromForm(event.currentTarget, answer)');
    expect(landingSource).toContain("answerTextareaRef");
    expect(landingSource).toContain('defaultValue=""');
    expect(landingSource).toContain('"pageshow"');
    expect(landingSource).toContain("syncAnswerFromTextarea");
    expect(landingSource).toContain("onPointerDown={syncAnswerFromTextarea}");
  });

  it("passes the first landing answer into onboarding as a seed", () => {
    const requestPageSource = read("packages/web/app/network/request/page.tsx");
    const signalPageSource = read("packages/web/app/network/signal/page.tsx");

    expect(surfaceASource).toContain("seed");
    expect(requestPageSource).toContain("initialNeed");
    expect(signalPageSource).toContain("initialProfileHint");
  });

  it("tracks the network_entry_selected event with the two front-door intents", () => {
    const landingSource = read("packages/web/components/marketing/network-landing.tsx");
    expect(landingSource).toContain("network_entry_selected");
    expect(landingSource).toContain("member-signal");
    expect(landingSource).toContain("manual-search");
  });

  it("keeps the approval language in the first viewport", () => {
    expect(surfaceASource).toContain("Private until approved");
    expect(surfaceASource).toContain("asks before");
  });

  it("does not use detached floating proof cards in the hero", () => {
    expect(surfaceASource).not.toContain("ProofCard");
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
