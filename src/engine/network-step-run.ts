import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { PROJECT_ROOT } from "../paths";

export const NETWORK_LANE_STEP_PREFIX = "network-lane-step:";
const NETWORK_LANE_STEP_RUN_LOG = "network-lane-step-runs.jsonl";
const NETWORK_LANE_STEP_RUN_ID_RE =
  /^network-lane-step:[^:\s]+:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function isNetworkLaneStepRunIdShape(
  stepRunId: unknown,
): stepRunId is string {
  return (
    typeof stepRunId === "string" &&
    stepRunId.trim() === stepRunId &&
    NETWORK_LANE_STEP_RUN_ID_RE.test(stepRunId)
  );
}

/**
 * Background Watch step-run routes (Brief 293). The watch never contacts
 * anyone (Insight-235); `tool-resolver` consults `isBackgroundWatchStepRun`
 * to refuse resolving any tool outside `BACKGROUND_WATCH_ALLOWED_TOOLS`.
 */
export const BACKGROUND_WATCH_STEP_ROUTES = [
  "network-background-watch-sweep",
  "network-background-watch-manual",
] as const;

export function isBackgroundWatchStepRun(stepRunId: unknown): boolean {
  if (typeof stepRunId !== "string") return false;
  if (!stepRunId.startsWith(NETWORK_LANE_STEP_PREFIX)) return false;
  const tail = stepRunId.slice(NETWORK_LANE_STEP_PREFIX.length);
  const colon = tail.indexOf(":");
  if (colon === -1) return false;
  const route = tail.slice(0, colon);
  return (BACKGROUND_WATCH_STEP_ROUTES as readonly string[]).includes(route);
}

export async function isServerMintedNetworkLaneStepRunId(
  stepRunId: unknown,
  opts: { rootDir?: string } = {},
): Promise<boolean> {
  if (!isNetworkLaneStepRunIdShape(stepRunId)) return false;

  const auditFile = path.join(auditRoot(opts.rootDir), "audit", NETWORK_LANE_STEP_RUN_LOG);
  try {
    const contents = await fs.readFile(auditFile, "utf-8");
    return contents
      .split("\n")
      .filter(Boolean)
      .some((line) => {
        try {
          const record = JSON.parse(line) as { stepRunId?: unknown };
          return record.stepRunId === stepRunId;
        } catch {
          return false;
        }
      });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

export async function requireServerMintedNetworkLaneStepRunId(
  stepRunId: unknown,
  operation: string,
  opts: { rootDir?: string } = {},
): Promise<string> {
  if (!(await isServerMintedNetworkLaneStepRunId(stepRunId, opts))) {
    throw new Error(`${operation} requires a server-minted network-lane stepRunId`);
  }
  return stepRunId as string;
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
    path.join(auditDir, NETWORK_LANE_STEP_RUN_LOG),
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
