/**
 * ArchiveDrawer — Brief 281 source-contract guard.
 *
 * Mirrors the chat-conversation.test.ts pattern (readFileSync + substring
 * assertions — no jsdom). Pins the accessibility and architectural seams a
 * reviewer must not see regress:
 *  - AC3:  no DB query logic in React — it fetches the shared route.
 *  - AC5:  the drawer hits the route, the route owns the helper.
 *  - AC15: reduced-motion-safe transitions + 44px mobile touch targets.
 *  - read-only: drill links only, no mutating fetch verbs.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "archive-drawer.tsx"), "utf8");

describe("ArchiveDrawer — Brief 281", () => {
  it("AC3/AC5: queries the shared read-only route, no DB logic in React", () => {
    expect(source).toContain("/api/v1/workspace/archive?");
    // No drizzle / db import leaking into the client bundle.
    expect(source).not.toContain('from "drizzle-orm"');
    expect(source).not.toMatch(/from\s+["'][^"']*\/src\/db/);
    // It must not import the server-only helper — it goes through the route.
    expect(source).not.toMatch(/^\s*import[^\n]*workspace-recall/m);
  });

  it("is read-only — no mutating fetch verbs", () => {
    expect(source).not.toMatch(/method:\s*["'](POST|PUT|DELETE|PATCH)["']/);
  });

  it("AC15: reduced-motion-safe transitions", () => {
    expect(source).toContain("motion-safe:");
    expect(source).not.toMatch(/(?<!motion-safe:)\btransition-transform\b/);
  });

  it("AC15: 44px minimum touch targets on interactive controls", () => {
    expect(source).toContain("min-h-[44px]");
  });

  it("is an accessible dialog with Escape-to-close and focus management", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('e.key === "Escape"');
    expect(source).toContain("inputRef.current?.focus()");
  });

  it("renders the archived toggle and kind filters from the recall taxonomy", () => {
    for (const k of ["project", "process", "memory", "work", "review", "activity"]) {
      expect(source).toContain(`"${k}"`);
    }
    expect(source).toContain("includeArchived");
  });

  it("drills via Next Link and closes the drawer on navigate (context preserved)", () => {
    expect(source).toContain('from "next/link"');
    expect(source).toContain("onClick={onClose}");
  });
});
