/**
 * Ditto — Data Part Schemas (AI SDK v6 dataPartSchemas)
 *
 * Zod schemas for Ditto's 5 custom data part types.
 * Shared between route handler (emission) and useChat (reception).
 * Eliminates `as never` casts on custom data parts.
 *
 * AC8: dataPartSchemas with Zod validation for all custom data parts.
 *
 * Provenance: Brief 058, AI SDK v6 dataPartSchemas pattern.
 * Brief 068: Added data-confidence for structured confidence assessment.
 */

import { z } from "zod";

/**
 * Content block data part — structured engine output rendered via BlockList.
 * Emitted as `data-content-block`.
 */
export const contentBlockSchema = z.object({
  type: z.string(),
  // Allow any additional properties — ContentBlock is a discriminated union
  // validated at render time by the block registry
}).passthrough();

/**
 * Status data part — transient status updates during processing.
 * Emitted as `data-status` with transient flag (AC12).
 */
export const statusSchema = z.object({
  message: z.string(),
});

/**
 * Credential request data part — triggers masked credential input.
 * Emitted as `data-credential-request`.
 */
export const credentialRequestSchema = z.object({
  service: z.string(),
  processSlug: z.string().nullable(),
  fieldLabel: z.string(),
  placeholder: z.string(),
});

/**
 * Confidence assessment data part — structured confidence metadata (Brief 068).
 * Emitted as `data-confidence`. Response-level metadata, NOT a ContentBlock.
 */
export const confidenceSchema = z.object({
  level: z.enum(["high", "medium", "low"]),
  summary: z.string(),
  checks: z.array(z.object({
    label: z.string(),
    detail: z.string(),
    category: z.string(),
  })),
  uncertainties: z.array(z.object({
    label: z.string(),
    detail: z.string(),
    severity: z.enum(["minor", "major"]),
  })),
});

/**
 * Structured data part — legacy structured data emission.
 * Emitted as `data-structured`.
 */
export const structuredDataSchema = z.record(z.string(), z.unknown());

/**
 * Combined schemas object for useChat dataPartSchemas option.
 *
 * Convention: each key is the suffix after "data-" in the emitted part type.
 * e.g., key "status" matches part type "data-status" emitted by the route handler.
 * The AI SDK maps `type: "data-{key}"` ↔ `dataPartSchemas[key]` automatically.
 */
export const dataPartSchemas = {
  "content-block": contentBlockSchema,
  "status": statusSchema,
  "credential-request": credentialRequestSchema,
  "confidence": confidenceSchema,
  "structured": structuredDataSchema,
} as const;

/**
 * Inferred types from schemas — use these instead of manual type assertions.
 */
export type ContentBlockData = z.infer<typeof contentBlockSchema>;
export type StatusData = z.infer<typeof statusSchema>;
export type CredentialRequestData = z.infer<typeof credentialRequestSchema>;
export type ConfidenceData = z.infer<typeof confidenceSchema>;
export type StructuredData = z.infer<typeof structuredDataSchema>;
