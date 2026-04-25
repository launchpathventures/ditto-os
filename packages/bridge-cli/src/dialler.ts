/**
 * WebSocket dialler — outbound-dial worker pattern from `actions/runner`.
 * Brief 212 §Constraints "Reconnect backoff is capped at 60 seconds".
 *
 * Usage:
 *   const d = new Dialler({ dialUrl, jwt, onFrame });
 *   d.start();   // dials and stays connected; reconnects with backoff
 *   d.stop();    // graceful close
 *
 * Buffers in-flight stream frames during a disconnect; replays on
 * reconnect so the cloud sees a continuous output stream (AC #9).
 */
import WebSocket from "ws";
import * as jsonrpc from "jsonrpc-lite";

export interface DiallerOptions {
  dialUrl: string;
  jwt: string;
  /** Receive parsed JSON-RPC frames (the daemon handles them). */
  onFrame: (frame: jsonrpc.IParsedObject) => void;
  /** Called once after a successful upgrade. */
  onConnected?: () => void;
  /** Called when the socket drops. */
  onDisconnected?: (reason: string) => void;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
const PERSISTENT_FAIL_LOG_MS = 30 * 60 * 1000;

export class Dialler {
  private ws: WebSocket | null = null;
  private closing = false;
  private currentBackoff = INITIAL_BACKOFF_MS;
  private firstFailureAt: number | null = null;
  private outboundQueue: string[] = [];

  constructor(private readonly options: DiallerOptions) {}

  start(): void {
    this.closing = false;
    void this.connect();
  }

  stop(): void {
    this.closing = true;
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.close(1000, "daemon-shutdown");
    }
    this.ws = null;
  }

  /** Send a JSON string over the wire; buffer if disconnected. */
  send(payload: string): void {
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(payload);
    } else {
      // Buffer up to 1000 frames; older frames are dropped on overflow
      // (a 4 MB stream cap upstream limits realistic queue sizes).
      this.outboundQueue.push(payload);
      if (this.outboundQueue.length > 1000) {
        this.outboundQueue.splice(0, this.outboundQueue.length - 1000);
      }
    }
  }

  private async connect(): Promise<void> {
    if (this.closing) return;

    const ws = new WebSocket(this.options.dialUrl, {
      headers: { Authorization: `Bearer ${this.options.jwt}` },
    });
    this.ws = ws;

    ws.once("open", () => {
      this.currentBackoff = INITIAL_BACKOFF_MS;
      this.firstFailureAt = null;
      this.options.onConnected?.();
      // Flush the buffered outbound queue.
      while (this.outboundQueue.length > 0 && ws.readyState === ws.OPEN) {
        const frame = this.outboundQueue.shift();
        if (frame) ws.send(frame);
      }
    });

    ws.on("message", (data) => {
      try {
        const text = data.toString("utf8");
        const parsed = jsonrpc.parse(text);
        const single = Array.isArray(parsed) ? parsed[0] : parsed;
        if (single) this.options.onFrame(single);
      } catch (err) {
        console.error("[bridge-cli] frame parse error:", err);
      }
    });

    ws.on("close", (code, reason) => {
      const reasonText = `code=${code} reason=${reason.toString("utf8") || "(none)"}`;
      this.options.onDisconnected?.(reasonText);
      // Special handling for revocation / protocol upgrade — exit cleanly.
      if (code === 4001 || code === 4426) {
        console.log(`[bridge-cli] connection terminated: ${reasonText} — exiting.`);
        process.exit(code === 4001 ? 2 : 3);
      }
      this.scheduleReconnect();
    });

    ws.on("error", (err) => {
      // Don't log every reconnect-storm error; the close handler reschedules.
      if (this.firstFailureAt === null) {
        this.firstFailureAt = Date.now();
      }
      console.warn("[bridge-cli] ws error:", err.message);
    });
  }

  private scheduleReconnect(): void {
    if (this.closing) return;
    const backoff = Math.min(this.currentBackoff, MAX_BACKOFF_MS);
    const jitter = Math.random() * 0.3 * backoff;
    const wait = backoff + jitter;

    if (this.firstFailureAt === null) this.firstFailureAt = Date.now();
    if (Date.now() - this.firstFailureAt > PERSISTENT_FAIL_LOG_MS) {
      console.warn(
        `[bridge-cli] still trying to reconnect after ${Math.round(
          (Date.now() - this.firstFailureAt) / 60000,
        )} min — check workspace URL/credentials.`,
      );
      this.firstFailureAt = Date.now();
    }

    setTimeout(() => {
      this.currentBackoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      void this.connect();
    }, wait).unref?.();
  }
}
