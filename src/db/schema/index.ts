/**
 * Ditto — Unified Schema Index
 *
 * Re-exports all tables and types from the domain schemas.
 * This is the single import point for application code:
 *
 *   import { processes, people, chatSessions } from "../db/schema";
 *
 * The domain split mirrors the ADR-025 deployment topology and the
 * ADR-036 §1/§3 workspace/network tier boundary:
 *
 *   engine.ts    — @ditto/core harness primitives (every workspace)
 *   harness.ts   — workspace-tier harness primitives not yet in @ditto/core
 *                  (e.g., reviewPages — Brief 106; relocated by Brief 262)
 *   knowledge.ts — workspace-tier knowledge base (documents, documentContent;
 *                  Brief 079; relocated by Brief 262)
 *   network.ts   — Centralized Ditto Network Service (ADR-025 §2)
 *   frontdoor.ts — Public-facing anonymous visitor tables
 *   product.ts   — Workspace-level Ditto features (not engine)
 */

export * from "./engine.js";
export * from "./harness.js";
export * from "./knowledge.js";
export * from "./network.js";
export * from "./frontdoor.js";
export * from "./product.js";
