/**
 * GET/POST /api/v1/network/admin/users/[userId] — Per-user detail + admin actions (Brief 108 AC2-6).
 *
 * GET: User detail with processes, runs, trust tiers, quality metrics.
 * POST: Admin actions — pause, resume, feedback, act-as.
 *
 * Provenance: Brief 108, Insight-160.
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  const { userId } = await params;

  try {
    const { getUserDetail } = await import(
      "../../../../../../../../../src/engine/admin-oversight"
    );

    const detail = await getUserDetail(userId);

    if (!detail) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error(`[/api/v1/network/admin/users/${userId}] GET Error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch user detail." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  const { userId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action as string;
  if (!action) {
    return NextResponse.json(
      { error: "Missing 'action' field. Valid: pause, resume, feedback, act_as_alex." },
      { status: 400 },
    );
  }

  const adminId = auth.userId;

  try {
    const {
      pauseUserProcesses,
      resumeUserProcesses,
      addAdminFeedback,
      sendAsAlex,
    } = await import(
      "../../../../../../../../../src/engine/admin-oversight"
    );

    switch (action) {
      case "pause": {
        await pauseUserProcesses(userId, adminId);
        return NextResponse.json({ success: true, action: "paused" });
      }

      case "resume": {
        await resumeUserProcesses(userId, adminId);
        return NextResponse.json({ success: true, action: "resumed" });
      }

      case "feedback": {
        const feedback = body.feedback as string;
        if (!feedback) {
          return NextResponse.json(
            { error: "Missing 'feedback' field." },
            { status: 400 },
          );
        }
        const feedbackId = await addAdminFeedback(userId, feedback, adminId);
        return NextResponse.json({ success: true, action: "feedback_added", feedbackId });
      }

      case "act_as_alex": {
        const to = body.to as string;
        const subject = body.subject as string;
        const emailBody = body.body as string;
        const personId = body.personId as string;

        if (!to || !subject || !emailBody || !personId) {
          return NextResponse.json(
            { error: "Missing required fields: to, subject, body, personId." },
            { status: 400 },
          );
        }

        const result = await sendAsAlex({
          to,
          subject,
          body: emailBody,
          personId,
          userId,
          adminId,
        });

        return NextResponse.json({
          success: result.success,
          action: "sent_as_alex",
          ...(result.error ? { error: result.error } : {}),
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Valid: pause, resume, feedback, act_as_alex.` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error(`[/api/v1/network/admin/users/${userId}] POST Error:`, error);
    return NextResponse.json(
      { error: "Admin action failed." },
      { status: 500 },
    );
  }
}
