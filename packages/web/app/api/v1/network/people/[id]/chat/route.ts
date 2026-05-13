import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type { NetworkProfileCardBlock } from "@ditto/core";
import { networkDb, withNetworkDbAvailability } from "../../../../../../../../../src/db/network-db";
import { buildNetworkKbContext } from "../../../../../../../../../src/engine/network-kb-context";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import { forwardNoteToUser } from "../../../../../../../../../src/engine/forward-note-to-user";
import { buildFrontDoorPrompt } from "../../../../../../../../../src/engine/network-chat-prompt";
import {
  generateVisitorGreeterResponseFromPrompt,
  type VisitorChatFact,
} from "../../../../../../../../../src/engine/visitor-profile-chat";
import {
  appendVisitorProfileTurn,
  clearPendingVisitorForward,
  clearPendingVisitorIntro,
  consumePendingVisitorForward,
  getVisitorProfileTranscript,
  setPendingVisitorForward,
  setPendingVisitorIntro,
} from "../../../../../../../../../src/engine/visitor-profile-session";
import {
  checkVisitorRateLimit,
  visitorRateLimitCopy,
} from "../../../../../../../../../src/engine/visitor-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function normalizeHandle(handle: string): string {
  return decodeURIComponent(handle).trim().toLowerCase();
}

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "them";
}

function visitorIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

async function loadUser(handle: string) {
  const [user] = await networkDb
    .select()
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.handle, handle))
    .limit(1);
  return user ?? null;
}

function visitorSessionId(value: unknown, fingerprint: string | null, ip: string): string {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  return `anonymous:${fingerprint || ip}`.slice(0, 200);
}

function profileCardFacts(card: NetworkProfileCardBlock | null, fallbackBio: string | null): VisitorChatFact[] {
  const facts: VisitorChatFact[] = [];
  if (card?.oneLineRole) {
    facts.push({
      factMd: card.oneLineRole,
      visibility: card.visibility,
      sourceLabel: "profile card",
    });
  }
  if (card?.narrativeMd) {
    facts.push({
      factMd: card.narrativeMd,
      visibility: card.visibility,
      sourceLabel: "profile card",
    });
  } else if (fallbackBio) {
    facts.push({
      factMd: fallbackBio,
      visibility: "public",
      sourceLabel: "profile card",
    });
  }
  return facts.filter((fact) => fact.visibility !== "off");
}

function profileCardSerialized({
  user,
  handle,
  userName,
}: {
  user: typeof networkSchema.networkUsers.$inferSelect;
  handle: string;
  userName: string;
}): string {
  return JSON.stringify(
    user.card ?? {
      type: "network-profile-card",
      handle,
      name: userName,
      oneLineRole: user.businessContext || "Working with Ditto",
      narrativeMd: user.businessContext || "",
      visibility: user.wantsVisibility ? "public" : "on-request",
      greeterCuratedBy: user.personaAssignment === "mira" ? "mira" : "alex",
    },
    null,
    2,
  );
}

async function postHandler(request: Request, { params }: Params) {
  const { id } = await params;
  const normalizedHandle = normalizeHandle(id);
  const user = await loadUser(normalizedHandle);
  if (!user) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const ip = visitorIp(request);
  const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint.slice(0, 200) : null;
  const sessionId = visitorSessionId(body.sessionId, fingerprint, ip);
  const greeterName = user.personaAssignment === "mira" ? "Mira" : "Alex";
  const userName = user.name || normalizedHandle;
  const userFirst = firstName(userName);

  const rateLimit = await checkVisitorRateLimit({ ip, fingerprint, sessionId });
  if ("blocked" in rateLimit) {
    return NextResponse.json(
      {
        rateLimited: true,
        retryAfterSec: rateLimit.retryAfterSec,
        reply: visitorRateLimitCopy(greeterName, rateLimit),
      },
      { status: 429 },
    );
  }

  const visitorName = typeof body.visitorName === "string" ? body.visitorName.slice(0, 160) : null;
  const visitorOrg = typeof body.visitorOrg === "string" ? body.visitorOrg.slice(0, 160) : null;

  if (body.action === "forward_note") {
    const pending = consumePendingVisitorForward({ sessionId, userId: user.id });
    if (!pending) {
      return NextResponse.json({ error: "forward_note_not_pending" }, { status: 409 });
    }
    const factQuestionMd =
      typeof body.factQuestionMd === "string" && body.factQuestionMd.trim()
        ? body.factQuestionMd.trim()
        : pending.factQuestionMd;
    if (!factQuestionMd) {
      return NextResponse.json({ error: "fact_question_required" }, { status: 400 });
    }
    const stepRunId = await createNetworkLaneStepRun({
      route: "people-profile-forward-note",
      sessionId,
      actorId: sessionId,
    });
    await forwardNoteToUser({
      userId: user.id,
      stepRunId,
      fromVisitor: {
        name: visitorName,
        org: visitorOrg,
        ip,
        sessionId,
      },
      factQuestionMd,
    });
    const reply = `Sent. ${userFirst} usually replies within a day or two.`;
    const transcript = appendVisitorProfileTurn(sessionId, { role: "greeter", content: reply });
    return NextResponse.json({
      reply,
      transcript,
    });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 2_000) {
    return NextResponse.json({ error: "message_required" }, { status: 400 });
  }

  const priorTranscript = getVisitorProfileTranscript(sessionId);
  appendVisitorProfileTurn(sessionId, {
    role: "visitor",
    content: message,
  });
  clearPendingVisitorForward({ sessionId, userId: user.id });
  clearPendingVisitorIntro({ sessionId, userId: user.id });

  const kb = await buildNetworkKbContext({
    userId: user.id,
    audience: "visitor",
  });
  const facts = [
    ...profileCardFacts(user.card, user.businessContext),
    ...kb.facts.map((fact) => ({
      factMd: fact.factMd,
      visibility: fact.visibility,
      sourceLabel: fact.sourceLabel,
    })),
  ];
  const antiPersonaRules = [
    user.card?.antiPersonaMd,
    ...kb.privateFilters.map((rule) => rule.ruleMd),
  ].filter((rule): rule is string => Boolean(rule?.trim()));
  const representativePrompt = buildFrontDoorPrompt("visitor", undefined, undefined, undefined, {
    personaId: user.personaAssignment === "mira" ? "mira" : "alex",
    representativeContext: {
      greeterName,
      userName,
      userFirst,
      networkProfileCardSerialized: profileCardSerialized({
        user,
        handle: normalizedHandle,
        userName,
      }),
      kbBioMd: user.card?.narrativeMd || user.businessContext || "",
      kbFactsPublicAndOnRequest: facts
        .map((fact) => `- ${fact.visibility}: ${fact.factMd}`)
        .join("\n"),
      antiPersonaRules: antiPersonaRules.map((rule) => `- ${rule}`).join("\n"),
    },
  });
  if (
    !representativePrompt.includes("You are their REPRESENTATIVE") ||
    !representativePrompt.includes(userName)
  ) {
    throw new Error("visitor representative prompt did not render");
  }
  const response = await generateVisitorGreeterResponseFromPrompt({
    message,
    userFirst,
    userName,
    greeterName,
    representativePrompt,
    visitorName,
    visitorOrg,
    transcript: priorTranscript,
    facts,
    antiPersonaRules,
  });

  if (response.kind === "forward-note") {
    const stepRunId = await createNetworkLaneStepRun({
      route: "people-profile-forward-note",
      sessionId,
      actorId: sessionId,
    });
    await forwardNoteToUser({
      userId: user.id,
      stepRunId,
      fromVisitor: {
        name: visitorName,
        org: visitorOrg,
        ip,
        sessionId,
      },
      factQuestionMd: response.factQuestionMd,
    });
  }
  if (response.kind === "forward-offer") {
    setPendingVisitorForward({
      sessionId,
      userId: user.id,
      factQuestionMd: response.factQuestionMd,
    });
  }

  const transcript = appendVisitorProfileTurn(sessionId, {
    role: "greeter",
    content: response.reply,
  });

  if (response.kind === "intro-preview") {
    setPendingVisitorIntro({
      sessionId,
      userId: user.id,
      draft: response.draft,
      transcript,
    });
  }

  return NextResponse.json({
    reply: response.reply,
    transcript,
    forwardedNoteOffer:
      response.kind === "forward-offer"
        ? { factQuestionMd: response.factQuestionMd }
        : undefined,
    introDraft:
      response.kind === "intro-preview"
        ? response.draft
        : undefined,
  });
}

export const POST = withNetworkDbAvailability(postHandler);
