import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { buildNetworkKbContext, filterFactsForAudience } from "./network-kb-context";
import { insertKbFact, upsertAntiPersonaRule } from "./network-kb-storage";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-kb-context-"));
}

describe("network KB context assembly", () => {
  it("filters facts by audience and only exposes private filters to the owner", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      await db.insert(networkSchema.networkUsers).values({
        id: "user-kb-context",
        email: "context@example.com",
      });
      await insertKbFact({
        db,
        rootDir,
        userId: "user-kb-context",
        sourceLabel: "Public source",
        factMd: "Public fact.",
        visibility: "public",
      });
      await insertKbFact({
        db,
        rootDir,
        userId: "user-kb-context",
        sourceLabel: "Request source",
        factMd: "On-request fact.",
        visibility: "on-request",
      });
      await insertKbFact({
        db,
        rootDir,
        userId: "user-kb-context",
        sourceLabel: "Private source",
        factMd: "Owner-only fact.",
        visibility: "off",
      });
      await upsertAntiPersonaRule({
        db,
        rootDir,
        userId: "user-kb-context",
        ruleMd: "Never pitch me to pure copywriting projects.",
      });

      const publicContext = await buildNetworkKbContext({
        db,
        userId: "user-kb-context",
        audience: "public",
      });
      const representativeContext = await buildNetworkKbContext({
        db,
        userId: "user-kb-context",
        audience: "representative",
      });
      const ownerContext = await buildNetworkKbContext({
        db,
        userId: "user-kb-context",
        audience: "owner",
      });
      const visitorContext = await buildNetworkKbContext({
        db,
        userId: "user-kb-context",
        audience: "visitor",
      });

      expect(publicContext.facts.map((fact) => fact.factMd)).toEqual(["Public fact."]);
      expect(publicContext.privateFilters).toHaveLength(0);
      expect(representativeContext.facts.map((fact) => fact.visibility).sort()).toEqual([
        "on-request",
        "public",
      ]);
      expect(ownerContext.facts).toHaveLength(3);
      expect(ownerContext.privateFilters[0]?.ruleMd).toContain("pure copywriting");
      expect(visitorContext.facts.map((fact) => fact.visibility).sort()).toEqual([
        "on-request",
        "public",
      ]);
      expect(visitorContext.privateFilters[0]?.ruleMd).toContain("pure copywriting");
    });
  }, 20_000);

  it("drops archived facts regardless of visibility", () => {
    expect(
      filterFactsForAudience([
        { visibility: "public", status: "archived", factMd: "old" },
        { visibility: "public", status: "active", factMd: "current" },
      ], "public").map((fact) => fact.factMd),
    ).toEqual(["current"]);
  });
});
