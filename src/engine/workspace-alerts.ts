/**
 * Ditto — Workspace Fleet Alerting
 *
 * Sends structured alerts via webhook (Slack, Discord, or generic HTTP POST).
 * Falls back to structured console.log when no webhook is configured.
 * Retry: 3 attempts with exponential backoff (1s, 2s, 4s).
 *
 * Provenance: Brief 091, PagerDuty/OpsGenie webhook integration pattern.
 */

export interface AlertPayload {
  type: "upgrade_failure" | "circuit_breaker_tripped" | "upgrade_complete" | "rollback_complete";
  upgradeId: string;
  imageRef: string;
  summary: string;
  failedWorkspaces?: Array<{ userId: string; error: string }>;
  timestamp: string;
}

export interface AlertSender {
  sendAlert(payload: AlertPayload): Promise<void>;
}

/**
 * Create an alert sender. Uses webhook URL if provided, otherwise logs to stdout.
 */
export function createAlertSender(webhookUrl?: string): AlertSender {
  if (webhookUrl) {
    return { sendAlert: (payload) => sendWebhookAlert(webhookUrl, payload) };
  }
  return { sendAlert: sendConsoleAlert };
}

/**
 * Send alert via webhook POST with retry (3 attempts, exponential backoff).
 */
async function sendWebhookAlert(
  webhookUrl: string,
  payload: AlertPayload,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return;
      }

      // Non-retryable client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        console.error(
          `[workspace-alerts] Webhook returned ${response.status}, not retrying:`,
          await response.text().catch(() => ""),
        );
        // Still log the alert to stdout so it's not lost
        await sendConsoleAlert(payload);
        return;
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        await sleep(delay);
      }
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await sleep(delay);
      } else {
        console.error(`[workspace-alerts] Webhook failed after ${maxRetries} attempts:`, error);
        // Fall back to console so the alert is never silently lost
        await sendConsoleAlert(payload);
      }
    }
  }
}

/**
 * Log alert as structured JSON to stdout.
 */
async function sendConsoleAlert(payload: AlertPayload): Promise<void> {
  console.log(JSON.stringify({ alert: true, ...payload }, null, 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
