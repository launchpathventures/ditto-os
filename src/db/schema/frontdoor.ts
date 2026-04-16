/**
 * Front Door Schema — Public-facing, anonymous visitor tables
 *
 * These tables serve the web front door: chat sessions with Alex,
 * email verification, magic link auth, funnel analytics.
 *
 * Deployment: lives on the Ditto Network service (public endpoints,
 * no auth required). Conceptually separate from the relationship graph.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";
import type { PersonaId } from "./network";

/** Front-door conversation stage. `picker` = persona not chosen yet.
 *  `interview` = user is getting a feel for one persona. `main` = committed. */
export const chatSessionStageValues = ["picker", "interview", "main"] as const;
export type ChatSessionStage = (typeof chatSessionStageValues)[number];

// ============================================================
// Front Door Chat Sessions (Brief 093)
// ============================================================

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  sessionId: text("session_id").notNull().unique(),
  messages: text("messages", { mode: "json" }).notNull().$type<Array<{ role: string; content: string }>>(),
  context: text("context").notNull(), // "front-door" | "referred" | "escalated"
  ipHash: text("ip_hash").notNull(),
  requestEmailFlagged: integer("request_email_flagged", { mode: "boolean" }).notNull().default(false),
  messageCount: integer("message_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  // Learned visitor context — persisted from LLM's `learned` output each turn.
  learned: text("learned", { mode: "json" }).$type<Record<string, string | null>>(),
  // Magic link auth (Brief 123): links session to authenticated user
  authenticatedEmail: text("authenticated_email"),
  // Brief 142: voice channel
  callOffered: integer("call_offered", { mode: "boolean" }).default(false),
  voiceToken: text("voice_token"),
  // Persona selection flow (Brief 152): visitor picks Alex or Mira before the main
  // front-door chat begins. `stage` tracks where they are in the flow; `personaId`
  // locks in once they commit. `interviewTranscripts` retains what they said to
  // each persona so switching back doesn't restart, and so the committed persona
  // can reference the interview conversation.
  personaId: text("persona_id").$type<PersonaId>(),
  stage: text("stage").$type<ChatSessionStage>().notNull().default("picker"),
  interviewTranscripts: text("interview_transcripts", { mode: "json" })
    .$type<Partial<Record<PersonaId, Array<{ role: string; content: string }>>>>(),
});

// ============================================================
// Email Verification Codes (Front Door)
// ============================================================

export const emailVerificationCodes = sqliteTable("email_verification_codes", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  sessionId: text("session_id").notNull(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date(Date.now() + 10 * 60 * 1000)),
});

// ============================================================
// Magic Links (Brief 123 — Workspace Lite)
// ============================================================

export const magicLinks = sqliteTable("magic_links", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  sessionId: text("session_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Verification — rate limiting and email tracking
// ============================================================

export const verifyAttempts = sqliteTable("verify_attempts", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  ipHash: text("ip_hash").notNull(),
  email: text("email").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const verificationEmails = sqliteTable("verification_emails", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  recipientEmail: text("recipient_email").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Funnel Analytics
// ============================================================

export const funnelEvents = sqliteTable("funnel_events", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  sessionId: text("session_id").notNull(),
  event: text("event").notNull(),
  surface: text("surface").notNull(), // "front-door" | "verify" | "referred"
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Suggestion Dismissals — proactive guidance feedback loop
// ============================================================

export const suggestionDismissals = sqliteTable("suggestion_dismissals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  suggestionType: text("suggestion_type").notNull(),
  contentHash: text("content_hash").notNull(),
  content: text("content").notNull(),
  dismissedAt: integer("dismissed_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" })
    .notNull(),
}, (table) => [
  index("suggestion_dismissals_user_expires").on(table.userId, table.expiresAt),
]);
