/**
 * Self specificity probe tests (Brief 177).
 */

import { describe, it, expect } from "vitest";
import { scoreSpecificity } from "./self-specificity";

describe("scoreSpecificity", () => {
  it("returns a low score and a clarifying question for vague asks", () => {
    const r = scoreSpecificity("handle this for me");
    expect(r.score).toBeLessThan(2);
    expect(r.clarifyingQuestion).not.toBeNull();
  });

  it("returns score >= 2 for an unambiguous ask with person+temporal+action", () => {
    const r = scoreSpecificity("Send the quote to Sarah by Friday");
    expect(r.score).toBeGreaterThanOrEqual(2);
    expect(r.signals.action).toBe(true);
    expect(r.signals.named).toBe(true);
    expect(r.signals.temporal).toBe(true);
    expect(r.clarifyingQuestion).toBeNull();
  });

  it("detects action verb in 'follow up with my customers'", () => {
    const r = scoreSpecificity("follow up with my customers");
    expect(r.signals.action).toBe(true);
  });

  it("detects artefact in 'I need an invoice'", () => {
    const r = scoreSpecificity("I need an invoice for last month");
    expect(r.signals.artefact).toBe(true);
  });

  it("detects temporal anchor for 'by Friday'", () => {
    const r = scoreSpecificity("send email by Friday");
    expect(r.signals.temporal).toBe(true);
  });

  it("detects numeric outcome for '3 emails'", () => {
    const r = scoreSpecificity("send 3 emails to leads");
    expect(r.signals.outcome).toBe(true);
  });

  it("detects named person when capitalised and not sentence-first", () => {
    const r = scoreSpecificity("ping Sarah");
    expect(r.signals.named).toBe(true);
  });

  it("does NOT count a sentence-initial capitalised word as a name", () => {
    const r = scoreSpecificity("Pricing needs updating");
    expect(r.signals.named).toBe(false);
  });

  it("adds a domain signal when a known service is mentioned", () => {
    const r = scoreSpecificity("create a GitHub issue", {
      knownServices: ["github"],
    });
    expect(r.signals.domain).toBe(true);
  });

  it("adds a domain signal when a known process slug is mentioned", () => {
    const r = scoreSpecificity("run the quoting-process for this lead", {
      knownProcessSlugs: ["quoting-process"],
    });
    expect(r.signals.domain).toBe(true);
  });

  it("clarifying question mentions the missing specificity", () => {
    const r = scoreSpecificity("handle this");
    expect(r.clarifyingQuestion).toMatch(/what you want me to do|what's being/);
  });

  it("clarifying question is null when score ≥ 2", () => {
    const r = scoreSpecificity("create an invoice for Acme by tomorrow");
    expect(r.clarifyingQuestion).toBeNull();
  });
});
