import { NextResponse } from "next/server";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../../src/engine/network-step-run";
import { recordVoiceIntake } from "../../../../../../../../src/engine/network-voice-intake";
import { MAX_KB_UPLOAD_BYTES } from "../../../../../../../../src/engine/network-kb-storage";
import { resolveNetworkLaneSession } from "../session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VoiceInputMode = "speech" | "paste" | "manual";

function inputMode(value: unknown): VoiceInputMode {
  return value === "speech" || value === "manual" ? value : "paste";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: unknown;
      userId?: unknown;
      transcriptMd?: unknown;
      inputMode?: unknown;
    };
    const transcriptMd = typeof body.transcriptMd === "string" ? body.transcriptMd.trim() : "";
    if (!transcriptMd) {
      return NextResponse.json(
        { error: "transcript_required" },
        { status: 400 },
      );
    }
    if (Buffer.byteLength(transcriptMd, "utf-8") > MAX_KB_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "transcript_too_large" },
        { status: 413 },
      );
    }

    const session = await resolveNetworkLaneSession({
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      context: "expert",
      fallbackUserId: typeof body.userId === "string" ? body.userId : null,
    });
    if (!session) {
      return NextResponse.json(
        { error: "expert_session_required" },
        { status: 403 },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "network-kb-voice",
      sessionId: session.sessionId,
      actorId: session.actorId,
    });
    const result = await recordVoiceIntake({
      userId: session.userId,
      transcriptMd,
      inputMode: inputMode(body.inputMode),
      stepRunId,
      actorId: session.actorId,
      sessionId: session.sessionId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return networkUnavailableResponse();
    }
    console.error("[/api/v1/network/kb/voice] Error:", error);
    return NextResponse.json(
      { error: "voice_intake_failed" },
      { status: 500 },
    );
  }
}
