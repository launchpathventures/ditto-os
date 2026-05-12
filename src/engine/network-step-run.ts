import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { PROJECT_ROOT } from "../paths";

export const NETWORK_LANE_STEP_PREFIX = "network-lane-step:";

export interface NetworkLaneStepRunInput {
  route: string;
  sessionId?: string | null;
  actorId?: string | null;
  rootDir?: string;
  now?: Date;
}

function isTestMode(): boolean {
  return process.env.DITTO_TEST_MODE === "true";
}

function auditRoot(rootDir?: string): string {
  return path.resolve(
    rootDir ??
      process.env.NETWORK_KB_ROOT ??
      path.join(PROJECT_ROOT, "data", "network-kb"),
  );
}

export function requireNetworkStepRunId(
  stepRunId: string | undefined | null,
  operation: string,
  opts: { rejectWebDirect?: boolean } = {},
): string {
  if (!stepRunId && !isTestMode()) {
    throw new Error(`${operation} requires stepRunId (Insight-180)`);
  }
  const resolved = stepRunId || "test-mode-step-run";
  if (
    opts.rejectWebDirect &&
    resolved.startsWith("web-direct-action:") &&
    !isTestMode()
  ) {
    throw new Error(`${operation} requires a network-lane or harness stepRunId`);
  }
  return resolved;
}

export async function createNetworkLaneStepRun({
  route,
  sessionId,
  actorId,
  rootDir,
  now = new Date(),
}: NetworkLaneStepRunInput): Promise<string> {
  const stepRunId = `${NETWORK_LANE_STEP_PREFIX}${route}:${randomUUID()}`;
  const auditDir = path.join(auditRoot(rootDir), "audit");
  await fs.mkdir(auditDir, { recursive: true });
  await fs.appendFile(
    path.join(auditDir, "network-lane-step-runs.jsonl"),
    `${JSON.stringify({
      stepRunId,
      route,
      sessionId: sessionId ?? null,
      actorId: actorId ?? null,
      createdAt: now.toISOString(),
    })}\n`,
    "utf-8",
  );
  return stepRunId;
}
