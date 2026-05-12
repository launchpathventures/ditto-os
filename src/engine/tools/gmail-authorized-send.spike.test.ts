/**
 * Manual Gmail authorized-send spike.
 *
 * Run with RUN_GMAIL_AUTHORIZED_SEND_SPIKE=true and a configured Google
 * Workspace CLI sandbox. Skipped by default so CI never sends email.
 */

import { describe, expect, it } from "vitest";
import { gmailAuthorizedSend } from "./gmail-authorized-send";

const runSpike = process.env.RUN_GMAIL_AUTHORIZED_SEND_SPIKE === "true";

describe.skipIf(!runSpike)("gmailAuthorizedSend spike", () => {
  it("sends one sandbox Gmail message and returns the response shape", async () => {
    const to = process.env.GMAIL_AUTHORIZED_SEND_SPIKE_TO;
    if (!to) {
      throw new Error("GMAIL_AUTHORIZED_SEND_SPIKE_TO is required for the spike");
    }

    const result = await gmailAuthorizedSend({
      stepRunId: `spike-${Date.now()}`,
      to,
      subject: "Ditto Beat 2 Gmail spike",
      body: "Sandbox spike from Brief 248. No action needed.",
    });

    expect(result.status).toBe("sent");
    expect(result.recipients).toContain(to);
    expect(result.sentAt).toEqual(expect.any(String));
  });
});
