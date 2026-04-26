/**
 * @ditto/core/work-items — brief-equivalent validators (Brief 223)
 *
 * Pure-function Zod validators for the brief-equivalent input shape. NO DB.
 * Used by `packages/web/app/api/v1/work-items/[id]/status/route.ts` and the
 * downstream work-item create surface (Brief 224's analyser writes here).
 */

import { z } from "zod";
import {
  briefStateValues,
  workItemTypeValues,
  runnerKindValues,
} from "../db/schema.js";

export const briefStateSchema = z.enum(briefStateValues);
export const workItemTypeSchema = z.enum(workItemTypeValues);
export const runnerKindSchema = z.enum(runnerKindValues);

/** Validates the brief-equivalent input shape (downstream consumer). */
export const workItemBriefInputSchema = z.object({
  projectId: z.string().min(1),
  type: workItemTypeSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(50_000),
  briefState: briefStateSchema.optional(),
  riskScore: z.number().int().min(0).max(100).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
  modelAssignment: z.string().max(120).nullish(),
  linkedCaptureId: z.string().nullish(),
});

/**
 * Validates the runner status webhook payload.
 *
 * Insight-180: `stepRunId` is OPTIONAL but its absence triggers the
 * bounded-waiver path (caller writes `guardWaived=true` to the audit row).
 */
export const workItemStatusUpdateSchema = z.object({
  state: briefStateSchema,
  prUrl: z.string().url().optional(),
  error: z.string().max(2_000).optional(),
  notes: z.string().max(2_000).optional(),
  stepRunId: z.string().min(1).optional(),
  runnerKind: runnerKindSchema.optional(),
  externalRunId: z.string().min(1).optional(),
  linkedProcessRunId: z.string().min(1).optional(),
});

export type WorkItemBriefInputParsed = z.infer<typeof workItemBriefInputSchema>;
export type WorkItemStatusUpdateParsed = z.infer<typeof workItemStatusUpdateSchema>;
