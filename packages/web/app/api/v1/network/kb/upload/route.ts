import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../../src/engine/network-step-run";
import {
  assertSupportedKbUpload,
  persistKbDocument,
  type FactVisibility,
} from "../../../../../../../../src/engine/network-kb-storage";
import { extractKbFacts } from "../../../../../../../../src/engine/network-kb-extract";
import { resolveNetworkLaneSession } from "../session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isFileLike(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function" &&
    "name" in value
  );
}

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function visibility(value: string | null): FactVisibility {
  return value === "public" || value === "off" ? value : "on-request";
}

async function readUploadSource(file: File): Promise<{ content: string; originalSizeBytes: number }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { extension } = assertSupportedKbUpload({
    filename: file.name,
    mimeType: file.type,
    sizeBytes: buffer.byteLength,
  });

  if (extension === ".pdf" || file.type === "application/pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const parsed = await parser.getText();
    return {
      content: parsed.text?.trim() || "",
      originalSizeBytes: buffer.byteLength,
    };
  }

  return {
    content: buffer.toString("utf-8"),
    originalSizeBytes: buffer.byteLength,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sessionId = formString(formData, "sessionId");
    const fallbackUserId = formString(formData, "userId");
    const session = await resolveNetworkLaneSession({
      sessionId,
      context: "expert",
      fallbackUserId,
    });
    if (!session) {
      return NextResponse.json(
        { error: "expert_session_required" },
        { status: 403 },
      );
    }

    const file = formData.get("file");
    const pastedText = formString(formData, "sourceText");
    const title = formString(formData, "title") || (isFileLike(file) ? file.name : "Pasted source");
    const sourceLabel = formString(formData, "sourceLabel") || title;
    const visibilityDefault = visibility(formString(formData, "visibilityDefault"));

    let content: string;
    let originalFilename: string | null = null;
    let mimeType = "text/markdown";
    let originalSizeBytes = 0;

    if (isFileLike(file) && file.size > 0) {
      originalFilename = file.name;
      mimeType = file.type || "text/plain";
      const source = await readUploadSource(file);
      content = source.content;
      originalSizeBytes = source.originalSizeBytes;
    } else if (pastedText) {
      content = pastedText;
      originalSizeBytes = Buffer.byteLength(content, "utf-8");
      assertSupportedKbUpload({
        filename: `${title}.md`,
        mimeType,
        sizeBytes: originalSizeBytes,
      });
    } else {
      return NextResponse.json(
        { error: "source_required" },
        { status: 400 },
      );
    }

    if (!content.trim()) {
      return NextResponse.json(
        { error: "source_empty" },
        { status: 400 },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "network-kb-upload",
      sessionId: session.sessionId,
      actorId: session.actorId,
    });
    const document = await persistKbDocument({
      userId: session.userId,
      kind: "upload",
      title,
      sourceLabel,
      originalFilename,
      mimeType,
      content,
      visibilityDefault,
      metadata: { originalSizeBytes },
    });
    const facts = await extractKbFacts({
      documentId: document.id,
      userId: session.userId,
      stepRunId,
      actorId: session.actorId,
      sessionId: session.sessionId,
    });

    return NextResponse.json({ document, facts });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return networkUnavailableResponse();
    }
    if (error instanceof Error) {
      return NextResponse.json(
        { error: "kb_upload_rejected", message: error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "kb_upload_failed" },
      { status: 500 },
    );
  }
}
