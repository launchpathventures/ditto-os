# Insight-140: Typed Schema Values as CI Guardrail

**Date:** 2026-04-01
**Trigger:** CI caught `"active"` used as WorkItemStatus (not a valid enum value) — agents guessed the value instead of reading the schema
**Layers affected:** L1 Process, L3 Harness
**Status:** active

## The Insight

When agents generate code that references schema enum values (like `WorkItemStatus`, `TrustTier`, `RunStatus`), they sometimes guess values that seem reasonable ("active") but don't exist in the schema ("in_progress" is the correct value). TypeScript's strict typing catches this at type-check time, not at runtime — the CI type-check step is the actual safety net.

This is a specific case of a broader pattern: the more the schema constrains values via literal union types (not just `string`), the more the type-checker serves as an automated reviewer for agent-generated code. The schema types in `src/db/schema.ts` are the contract; `pnpm run type-check` is the enforcer.

## Implications

- Agent prompts should include the actual enum values from schema when referencing status fields
- `$type<T>()` on Drizzle columns is essential — without it, the column is just `string` and no type error fires
- The CI type-check step is the first quality gate for agent-generated code, more important than tests for catching this class of error

## Where It Should Land

`docs/dev-process.md` — Builder constraints or brief template (include schema enum values when brief references status fields).
