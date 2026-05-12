import { and, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";

export type NetworkKbAudience = "owner" | "representative" | "public" | "share" | "visitor";

export interface NetworkKbContext {
  audience: NetworkKbAudience;
  facts: Array<typeof networkSchema.networkUserKbFacts.$inferSelect>;
  privateFilters: Array<typeof networkSchema.networkUserAntiPersona.$inferSelect>;
}

export function isFactAllowedForAudience(
  visibility: networkSchema.NetworkKbFactVisibility,
  audience: NetworkKbAudience,
): boolean {
  if (audience === "owner") return true;
  if (audience === "representative") return visibility === "public" || visibility === "on-request";
  return visibility === "public";
}

export function filterFactsForAudience<T extends { visibility: networkSchema.NetworkKbFactVisibility; status: networkSchema.NetworkKbFactStatus }>(
  facts: T[],
  audience: NetworkKbAudience,
): T[] {
  return facts.filter(
    (fact) =>
      fact.status === "active" &&
      isFactAllowedForAudience(fact.visibility, audience),
  );
}

export async function buildNetworkKbContext({
  db = networkDb,
  userId,
  audience,
}: {
  db?: NetworkDbLike;
  userId: string;
  audience: NetworkKbAudience;
}): Promise<NetworkKbContext> {
  const facts = await db
    .select()
    .from(networkSchema.networkUserKbFacts)
    .where(eq(networkSchema.networkUserKbFacts.userId, userId));
  const filteredFacts = filterFactsForAudience(facts, audience);
  const privateFilters =
    audience === "owner"
      ? await db
          .select()
          .from(networkSchema.networkUserAntiPersona)
          .where(
            and(
              eq(networkSchema.networkUserAntiPersona.userId, userId),
              eq(networkSchema.networkUserAntiPersona.status, "active"),
            ),
          )
      : [];
  return { audience, facts: filteredFacts, privateFilters };
}
