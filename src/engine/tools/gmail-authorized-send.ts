/**
 * Gmail authorized send — Greeter Beat 2 first side-effect slice.
 *
 * Requires stepRunId per Insight-180. The default implementation routes
 * through the existing Google Workspace integration resolver (`gws gmail
 * messages send`) so this stays additive to the current Gmail plumbing.
 */

import { MissingStepRunIdError } from "../errors";
import type { AuthorizationResult } from "../content-blocks";
import { resolveTools } from "../tool-resolver";

export const GMAIL_AUTHORIZED_SEND_TOOL_NAME = "gmail-authorized-send";

export interface GmailAuthorizedSendInput {
  stepRunId?: string;
  to: string | string[];
  subject: string;
  body: string;
  draftId?: string;
}

function normalizeRecipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to])
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function readMessageId(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return String(parsed.messageId ?? parsed.id ?? parsed.message_id ?? "") || undefined;
  } catch {
    const match = raw.match(/(?:messageId|message_id|id)["':\s]+([A-Za-z0-9._-]+)/);
    return match?.[1];
  }
}

export async function gmailAuthorizedSend(
  input: GmailAuthorizedSendInput,
): Promise<AuthorizationResult> {
  if (!input.stepRunId && process.env.DITTO_TEST_MODE !== "true") {
    throw new MissingStepRunIdError(
      "gmailAuthorizedSend requires stepRunId before sending email",
    );
  }

  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    return {
      status: "failed",
      reasonForVisitor: "I need a recipient before I can send this.",
      reasonForLog: "missing_recipient",
    };
  }

  if (!input.subject?.trim() || !input.body?.trim()) {
    return {
      status: "failed",
      reasonForVisitor: "The draft needs a subject and body before I can send it.",
      reasonForLog: "missing_subject_or_body",
    };
  }

  if (process.env.DITTO_TEST_MODE === "true") {
    return {
      status: "sent",
      messageId: `test-suppressed-gmail-${Date.now()}`,
      sentAt: new Date().toISOString(),
      recipients,
    };
  }

  try {
    const resolved = resolveTools(["google-workspace.send_message"]);
    const raw = await resolved.executeIntegrationTool(
      "google-workspace.send_message",
      {
        to: recipients.join(","),
        subject: input.subject,
        body: input.body,
      },
      { stepRunId: input.stepRunId },
    );

    if (/^Error:/i.test(raw)) {
      return {
        status: "failed",
        reasonForVisitor: "Gmail did not accept the send. Check the connection and try again.",
        reasonForLog: raw,
      };
    }

    return {
      status: "sent",
      messageId: readMessageId(raw),
      sentAt: new Date().toISOString(),
      recipients,
    };
  } catch (error) {
    return {
      status: "failed",
      reasonForVisitor: "Gmail asked me to reconnect before sending.",
      reasonForLog: error instanceof Error ? error.message : String(error),
    };
  }
}
