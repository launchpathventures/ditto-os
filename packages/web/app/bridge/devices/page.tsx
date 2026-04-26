"use client";

/**
 * Devices admin page — Brief 212.
 *
 * Lists paired devices for the current workspace + lets the user generate
 * a fresh pairing code, revoke a device, or rotate (= revoke + emit a
 * fresh code). Mobile-friendly: touch targets ≥44pt; command preview
 * wraps cleanly.
 */
import { useEffect, useState } from "react";

interface Device {
  id: string;
  deviceName: string;
  status: "active" | "revoked" | "rotated";
  pairedAt: string | null;
  lastDialAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  protocolVersion: string;
}

interface PairingCode {
  code: string;
  expiresAt: string;
  dialUrl: string;
  warning: string;
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function isOnline(d: Device): boolean {
  if (d.status !== "active" || !d.lastDialAt) return false;
  return Date.now() - new Date(d.lastDialAt).getTime() < ONLINE_WINDOW_MS;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setError(null);
    try {
      const res = await fetch("/api/v1/bridge/devices");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { devices: Device[] };
      setDevices(body.devices);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, []);

  const issueCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/bridge/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      setPairing((await res.json()) as PairingCode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this device? In-flight jobs will be marked revoked.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/bridge/devices/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rotate = async (id: string) => {
    if (!confirm("Rotate this device's JWT? You'll need to re-pair the daemon with a new code.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/bridge/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as PairingCode & { rotated: true };
      setPairing(body);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // best-effort
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Local Devices</h1>
        <button
          onClick={issueCode}
          disabled={busy}
          data-testid="bridge-pair-new"
          className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Pair a new device
        </button>
      </div>

      <p className="mb-6 text-sm text-gray-600">
        Devices that run commands on your hardware via Brief 212&apos;s Workspace Local Bridge.
        Used by <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">runner=local-mac-mini</code> projects.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {pairing && (
        <div
          data-testid="bridge-pairing-code"
          className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4"
        >
          <div className="mb-2 text-sm font-semibold text-blue-900">Pairing code (shown once)</div>
          <div className="mb-3 break-all font-mono text-2xl tracking-wider text-blue-900">
            {pairing.code}
          </div>
          <div className="mb-3 text-xs text-blue-800">{pairing.warning}</div>
          <div className="mb-3 rounded border border-blue-200 bg-white p-3 text-xs">
            <div className="mb-1 text-gray-600">Run on the device you want to pair:</div>
            <code className="block break-all text-gray-900">
              pnpm --filter ditto-bridge exec ditto-bridge pair {pairing.code} {pairing.dialUrl.replace("ws://", "http://").replace("wss://", "https://").replace("/api/v1/bridge/_dial", "")}
            </code>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => copy(pairing.code)}
                className="min-h-[40px] rounded border border-blue-300 bg-white px-3 py-1 text-xs text-blue-700 hover:bg-blue-100"
              >
                Copy code
              </button>
              <button
                onClick={() => setPairing(null)}
                className="min-h-[40px] rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="text-xs text-blue-800">
            Code expires {formatTime(pairing.expiresAt)} ({new Date(pairing.expiresAt).toLocaleTimeString()}).
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-gray-500">Loading devices...</div>}

      {!loading && devices.length === 0 && (
        <div
          data-testid="bridge-empty"
          className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600"
        >
          <div className="mb-2 font-medium text-gray-900">No paired devices yet.</div>
          <div>Click &ldquo;+ Pair a new device&rdquo; to get a code, then run the displayed command on your laptop.</div>
        </div>
      )}

      {!loading && devices.length > 0 && (
        <ul className="flex flex-col gap-3" data-testid="bridge-device-list">
          {devices.map((d) => (
            <li
              key={d.id}
              data-testid="bridge-device-row"
              className="rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    d.status === "active" && isOnline(d)
                      ? "bg-green-500"
                      : d.status === "revoked"
                        ? "bg-red-400"
                        : "bg-gray-400"
                  }`}
                  aria-hidden
                />
                <span className="font-medium">{d.deviceName}</span>
                <span className="text-xs text-gray-500">
                  {d.status === "revoked"
                    ? `revoked ${formatTime(d.revokedAt)}`
                    : isOnline(d)
                      ? "online"
                      : `last seen ${formatTime(d.lastDialAt)}`}
                </span>
              </div>
              {d.revokedReason && (
                <div className="mt-1 text-xs text-gray-500">Reason: {d.revokedReason}</div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => rotate(d.id)}
                  disabled={busy || d.status !== "active"}
                  className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Rotate
                </button>
                <button
                  onClick={() => revoke(d.id)}
                  disabled={busy || d.status === "revoked"}
                  className="min-h-[44px] rounded-lg border border-red-300 bg-white px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
