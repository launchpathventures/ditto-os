/**
 * Ditto — Completion Notifier (Brief 098b follow-up)
 *
 * When a process completes with outputs and the user is email-based
 * (no configured outputDelivery), notify them immediately via email.
 *
 * A great EA doesn't wait to be asked "is it done?" — they walk over
 * and say "done, here's what I found."
 *
 * Fire-and-forget: notification failure never affects process completion.
 *
 * Provenance: Insight-160 (trust context), Insight-161 (email/workspace boundary).
 */

import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { notifyUser } from "./notify-user";

/**
 * Notify the user that a process completed, with a summary of outputs.
 *
 * Skips notification if:
 * - Process has configured outputDelivery (handled by process-io.ts)
 * - No userId found in run inputs
 * - No network user found for that userId
 * - Process is a system process (internal, user doesn't care)
 */
export async function notifyProcessCompletion(processRunId: string): Promise<void> {
  // 1. Get the run + process
  const [run] = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      inputs: schema.processRuns.inputs,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, processRunId))
    .limit(1);

  if (!run) return;

  const [process] = await db
    .select({
      name: schema.processes.name,
      slug: schema.processes.slug,
      definition: schema.processes.definition,
      outputDelivery: schema.processes.outputDelivery,
    })
    .from(schema.processes)
    .where(eq(schema.processes.id, run.processId))
    .limit(1);

  if (!process) return;

  // Skip if outputDelivery is configured (process-io.ts handles it)
  if (process.outputDelivery) return;

  // Skip system processes (internal, user doesn't care)
  const definition = process.definition as Record<string, unknown>;
  if (definition.system === true) return;

  // 2. Find the userId from run inputs
  const inputs = run.inputs as Record<string, unknown> | null;
  const userId = inputs?.userId as string | undefined;
  if (!userId) return;

  // 3. Look up network user name for composing the message
  const [networkUser] = await db
    .select({ name: schema.networkUsers.name })
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.id, userId))
    .limit(1);

  if (!networkUser) return;

  // 4. Collect step outputs for summary
  const stepOutputs = await db
    .select({
      stepId: schema.stepRuns.stepId,
      outputs: schema.stepRuns.outputs,
    })
    .from(schema.stepRuns)
    .where(
      and(
        eq(schema.stepRuns.processRunId, processRunId),
        eq(schema.stepRuns.status, "approved"),
      ),
    );

  // Build a readable summary from step outputs
  const highlights: string[] = [];
  for (const step of stepOutputs) {
    const outputs = step.outputs as Record<string, unknown> | null;
    if (!outputs) continue;

    // Extract text summaries from outputs
    for (const [key, value] of Object.entries(outputs)) {
      if (typeof value === "string" && value.length > 0) {
        // Truncate long outputs
        const summary = value.length > 300 ? value.slice(0, 300) + "..." : value;
        highlights.push(summary);
      }
    }
  }

  // 5. Compose and send notification
  const userName = networkUser.name || "there";
  const processName = process.name || process.slug;

  let body: string;
  if (highlights.length > 0) {
    body = [
      `Hi ${userName},`,
      "",
      `I've finished working on "${processName}". Here's a summary:`,
      "",
      ...highlights.map((h) => `${h}`),
      "",
      "Reply if you want me to dig deeper or take a different angle.",
    ].join("\n");
  } else {
    body = [
      `Hi ${userName},`,
      "",
      `I've finished working on "${processName}". Everything completed successfully.`,
      "",
      "Reply if you have questions or want me to follow up on anything.",
    ].join("\n");
  }

  // Find the person record for this user (for interaction recording)
  const personId = inputs?.personId as string | undefined;

  try {
    const result = await notifyUser({
      userId,
      personId: personId || userId,
      subject: `Done: ${processName}`,
      body,
    });

    if (result.success) {
      console.log(`[completion] Notified user ${userId.slice(0, 8)} via ${result.channel}: ${processName} complete`);
    }
  } catch (err) {
    // Fire-and-forget
    console.error(`[completion] Failed to notify user ${userId.slice(0, 8)}:`, err);
  }
}
