/**
 * GET /api/v1/network/admin/teammate — Alex's workload view (admin-only).
 *
 * Returns all people in the network with their:
 * - Profile (name, email, org, journey layer, trust level)
 * - Active work (process runs in progress)
 * - Recent communications (interactions)
 * - Person memories (what Alex knows about them)
 * - Front door conversation (if available)
 *
 * This is the "teammate" view — see what Alex is doing for each user
 * and provide feedback as if you're Alex's colleague.
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { db, schema } = await import(
      "../../../../../../../../src/db"
    );
    const { desc, eq, and, sql, inArray } = await import("drizzle-orm");

    // 1. Get all people across all users, ordered by most recent activity
    const people = await db
      .select()
      .from(schema.people)
      .orderBy(desc(schema.people.createdAt))
      .limit(100);

    if (people.length === 0) {
      return NextResponse.json({ people: [], total: 0 });
    }

    const personIds = people.map((p) => p.id);

    // 2. Get recent interactions for all people (last 5 per person)
    const allInteractions = await db
      .select()
      .from(schema.interactions)
      .where(inArray(schema.interactions.personId, personIds))
      .orderBy(desc(schema.interactions.createdAt))
      .limit(500);

    // Group by personId
    const interactionsByPerson = new Map<string, typeof allInteractions>();
    for (const int of allInteractions) {
      const list = interactionsByPerson.get(int.personId) ?? [];
      if (list.length < 5) list.push(int);
      interactionsByPerson.set(int.personId, list);
    }

    // 3. Get person-scoped memories
    const allMemories = await db
      .select()
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.scopeType, "person"),
          eq(schema.memories.active, true),
          inArray(schema.memories.scopeId, personIds),
        ),
      )
      .orderBy(desc(schema.memories.confidence))
      .limit(500);

    const memoriesByPerson = new Map<string, typeof allMemories>();
    for (const mem of allMemories) {
      const list = memoriesByPerson.get(mem.scopeId) ?? [];
      if (list.length < 5) list.push(mem);
      memoriesByPerson.set(mem.scopeId, list);
    }

    // 4. Get active process runs (running or waiting_review)
    const activeRuns = await db
      .select()
      .from(schema.processRuns)
      .where(
        sql`${schema.processRuns.status} IN ('running', 'waiting_review', 'waiting_human')`,
      )
      .orderBy(desc(schema.processRuns.startedAt))
      .limit(100);

    // Link runs to people via interactions.processRunId
    const runIdsToPerson = new Map<string, string>();
    for (const int of allInteractions) {
      if (int.processRunId) {
        runIdsToPerson.set(int.processRunId, int.personId);
      }
    }

    // Also check run inputs for personId/email matches
    for (const run of activeRuns) {
      const inputs = run.inputs as Record<string, unknown> | null;
      if (inputs?.personId && typeof inputs.personId === "string") {
        if (personIds.includes(inputs.personId)) {
          runIdsToPerson.set(run.id, inputs.personId);
        }
      }
      if (inputs?.email && typeof inputs.email === "string") {
        const matchedPerson = people.find((p) => p.email === inputs.email);
        if (matchedPerson) {
          runIdsToPerson.set(run.id, matchedPerson.id);
        }
      }
    }

    const activeRunsByPerson = new Map<string, typeof activeRuns>();
    for (const run of activeRuns) {
      const personId = runIdsToPerson.get(run.id);
      if (personId) {
        const list = activeRunsByPerson.get(personId) ?? [];
        list.push(run);
        activeRunsByPerson.set(personId, list);
      }
    }

    // 5. Get process definitions for active runs (for step names)
    const processIds = [...new Set(activeRuns.map((r) => r.processId))];
    const processes = processIds.length > 0
      ? await db
          .select({ id: schema.processes.id, name: schema.processes.name, slug: schema.processes.slug })
          .from(schema.processes)
          .where(inArray(schema.processes.id, processIds))
      : [];
    const processById = new Map(processes.map((p) => [p.id, p]));

    // 6. Get front-door chat sessions linked by email
    const emailsWithSessions = people
      .filter((p) => p.email)
      .map((p) => p.email!);

    // Chat sessions don't have a direct person link — match via funnel events
    // For now, include the chat session count per context
    const chatSessions = emailsWithSessions.length > 0
      ? await db
          .select()
          .from(schema.chatSessions)
          .where(eq(schema.chatSessions.context, "front-door"))
          .orderBy(desc(schema.chatSessions.updatedAt))
          .limit(100)
      : [];

    // 7. Assemble the teammate view
    const teammateView = people.map((person) => {
      const interactions = interactionsByPerson.get(person.id) ?? [];
      const memories = memoriesByPerson.get(person.id) ?? [];
      const runs = activeRunsByPerson.get(person.id) ?? [];

      // Determine next action from active runs
      const activeWork = runs.map((run) => {
        const process = processById.get(run.processId);
        return {
          runId: run.id,
          processName: process?.name ?? run.processId,
          processSlug: process?.slug ?? null,
          status: run.status,
          currentStep: run.currentStepId,
          startedAt: run.startedAt,
          confidence: run.orchestratorConfidence,
        };
      });

      // Last communication
      const lastComm = interactions[0] ?? null;

      // Conversation summary from most recent interaction
      const recentComms = interactions.map((int) => ({
        type: int.type,
        channel: int.channel,
        mode: int.mode,
        subject: int.subject,
        summary: int.summary,
        outcome: int.outcome,
        createdAt: int.createdAt,
      }));

      return {
        person: {
          id: person.id,
          name: person.name,
          email: person.email,
          organization: person.organization,
          role: person.role,
          journeyLayer: person.journeyLayer,
          trustLevel: person.trustLevel,
          personaAssignment: person.personaAssignment,
          source: person.source,
          createdAt: person.createdAt,
          lastInteractionAt: person.lastInteractionAt,
        },
        activeWork,
        recentComms,
        memories: memories.map((m) => ({
          content: m.content,
          type: m.type,
          confidence: m.confidence,
          reinforcementCount: m.reinforcementCount,
        })),
        lastComm: lastComm
          ? {
              type: lastComm.type,
              subject: lastComm.subject,
              outcome: lastComm.outcome,
              createdAt: lastComm.createdAt,
            }
          : null,
        stats: {
          totalInteractions: interactions.length,
          hasActiveWork: runs.length > 0,
          memoryCount: memories.length,
        },
      };
    });

    return NextResponse.json({
      people: teammateView,
      total: teammateView.length,
      activePeopleCount: teammateView.filter((p) => p.stats.hasActiveWork).length,
      totalActiveRuns: activeRuns.length,
    });
  } catch (error) {
    console.error("[/api/v1/network/admin/teammate] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch teammate view." },
      { status: 500 },
    );
  }
}
