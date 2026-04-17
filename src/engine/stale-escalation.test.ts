/**
 * Stale Escalation tests (Brief 178).
 *
 * Unit-tests the pure helpers (classifier + formatter). The sweep
 * function exercises real DB writes and is covered by integration.
 */

import { describe, it, expect } from "vitest";
import { classifyStaleTier, buildStaleReminder } from "./stale-escalation";

describe("classifyStaleTier", () => {
  const now = new Date("2026-04-16T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  it("returns 0 for fresh waits (< 24h)", () => {
    expect(classifyStaleTier(hoursAgo(10), now)).toBe(0);
    expect(classifyStaleTier(hoursAgo(23.5), now)).toBe(0);
  });

  it("returns 1 at 24h", () => {
    expect(classifyStaleTier(hoursAgo(24), now)).toBe(1);
    expect(classifyStaleTier(hoursAgo(30), now)).toBe(1);
  });

  it("returns 2 at 48h", () => {
    expect(classifyStaleTier(hoursAgo(48), now)).toBe(2);
    expect(classifyStaleTier(hoursAgo(60), now)).toBe(2);
  });

  it("returns 3 at 72h+", () => {
    expect(classifyStaleTier(hoursAgo(72), now)).toBe(3);
    expect(classifyStaleTier(hoursAgo(168), now)).toBe(3);
  });
});

describe("buildStaleReminder", () => {
  const now = new Date("2026-04-16T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  it("produces a subject + body citing the process name", () => {
    const r = buildStaleReminder({
      processName: "Quote Approval",
      currentStepId: "review-output",
      waitingSince: daysAgo(2),
      now,
    });
    expect(r.subject).toContain("Quote Approval");
    expect(r.body).toContain("Quote Approval");
    expect(r.body).toContain("review-output");
    expect(r.body).toMatch(/2 days|2 day/);
  });

  it("handles a null process name gracefully", () => {
    const r = buildStaleReminder({
      processName: null,
      currentStepId: null,
      waitingSince: daysAgo(3),
      now,
    });
    expect(r.subject).toContain("a process");
    expect(r.body).toMatch(/3 days|3 day/);
  });

  it("floors to at least 1 day even for 25h-old waits", () => {
    const r = buildStaleReminder({
      processName: "p",
      currentStepId: null,
      waitingSince: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      now,
    });
    expect(r.body).toMatch(/1 day/);
  });

  it("Brief 179 P0-1: anchor differs from createdAt (sanity check)", () => {
    // This is just a documentation test that `classifyStaleTier` takes an
    // arbitrary Date, not specifically `createdAt`. The heartbeat now
    // passes `waitingStateSince ?? createdAt` (fallback for legacy runs),
    // so a run that ran for 8 days and just entered waiting state yields
    // tier 0 on the first sweep after that transition.
    const createdAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const waitingStateSince = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1h ago
    expect(classifyStaleTier(createdAt, now)).toBe(3); // would-be bug
    expect(classifyStaleTier(waitingStateSince, now)).toBe(0); // correct
  });
});
