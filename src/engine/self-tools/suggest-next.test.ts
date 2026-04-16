/**
 * Tests for suggest_next dedup logic (MP-10.1)
 */

import { describe, it, expect } from "vitest";
import { isDuplicateOfExistingProcess } from "./suggest-next";

describe("isDuplicateOfExistingProcess", () => {
  const activeProcesses = [
    { slug: "quoting", name: "Quoting & Estimation", description: "Generate quotes with materials and labour" },
    { slug: "invoice-generation", name: "Invoice Generation", description: "Create and send invoices" },
    { slug: "client-followup", name: "Client Follow-up", description: "Follow up on outstanding quotes" },
  ];

  it("detects exact slug match", () => {
    expect(isDuplicateOfExistingProcess("Quoting", ["quote", "bid"], activeProcesses)).toBe(true);
  });

  it("detects exact name match", () => {
    expect(isDuplicateOfExistingProcess("Invoice Generation", ["invoice"], activeProcesses)).toBe(true);
  });

  it("detects fuzzy stem match: invoicing ≈ invoice-generation", () => {
    expect(isDuplicateOfExistingProcess("Invoicing & Payment", ["invoice", "payment", "billing"], activeProcesses)).toBe(true);
  });

  it("detects keyword overlap: 2+ keywords match process text", () => {
    expect(isDuplicateOfExistingProcess("Quote Management", ["quote", "materials", "pricing"], activeProcesses)).toBe(true);
  });

  it("does not flag unrelated suggestion", () => {
    expect(isDuplicateOfExistingProcess("Job Scheduling", ["schedule", "calendar", "dispatch"], activeProcesses)).toBe(false);
  });

  it("does not flag with only 1 keyword match", () => {
    expect(isDuplicateOfExistingProcess("Compliance Tracking", ["compliance", "safety"], activeProcesses)).toBe(false);
  });

  it("handles empty active processes", () => {
    expect(isDuplicateOfExistingProcess("Quoting", ["quote"], [])).toBe(false);
  });

  it("handles null description in processes", () => {
    const procs = [{ slug: "quoting", name: "Quoting", description: null }];
    expect(isDuplicateOfExistingProcess("Quoting", ["quote"], procs)).toBe(true);
  });

  it("detects stem match without plural form in description", () => {
    // "invoicing" stems to "invoic", "invoice" also stems to "invoic" (trailing-e strip)
    const procs = [{ slug: "invoice-gen", name: "Invoice Generation", description: "Create and send invoice documents" }];
    expect(isDuplicateOfExistingProcess("Invoicing & Payment", ["invoicing", "payment", "billing"], procs)).toBe(true);
  });
});
