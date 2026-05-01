"use client";

/**
 * Admin — Fleet Management
 *
 * Provision, deprovision, upgrade, and rollback managed workspaces.
 * Calls the existing /api/v1/network/admin/{fleet,provision,deprovision,
 * upgrade,rollback,upgrades} endpoints (Briefs 090, 091, 100).
 *
 * Auth: localStorage admin token (Bearer). Same pattern as
 * /admin/users/[userId]/page.tsx.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  ArrowUp,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Server,
} from "lucide-react";

const TOKEN_KEY = "ditto-admin-token";

// ============================================================
// Types — match FleetWorkspace from src/engine/workspace-provisioner.ts
// ============================================================

interface FleetWorkspace {
  id: string;
  userId: string;
  workspaceUrl: string;
  status: string;
  currentVersion: string | null;
  serviceId: string | null;
  region: string;
  imageRef: string;
  lastHealthCheckAt: string | null;
  lastHealthStatus: string | null;
  createdAt: string;
}

interface FleetResponse {
  workspaces: FleetWorkspace[];
  total: number;
}

interface ProvisionResult {
  success: boolean;
  status: "created" | "existing";
  workspaceUrl: string;
  serviceId?: string;
  volumeId?: string;
  tokenId?: string;
}

interface UpgradeRecord {
  id: string;
  imageRef: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  totalCount: number | null;
  succeededCount: number | null;
  failedCount: number | null;
  triggeredBy: string | null;
}

// ============================================================
// Helpers
// ============================================================

function timeAgo(timestamp: string | null): string {
  if (!timestamp) return "—";
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function statusBadge(status: string, healthStatus: string | null) {
  const tone =
    status === "healthy" && healthStatus === "ok"
      ? "bg-positive/10 text-positive"
      : status === "provisioning"
        ? "bg-info/10 text-info"
        : status === "degraded" || status === "failed"
          ? "bg-negative/10 text-negative"
          : "bg-surface-subtle text-text-secondary";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}

// ============================================================
// Main page
// ============================================================

export default function AdminFleetPage() {
  const [token, setToken] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("admin");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [fleet, setFleet] = useState<FleetWorkspace[] | null>(null);
  const [upgrades, setUpgrades] = useState<UpgradeRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Provision form
  const [provisionUserId, setProvisionUserId] = useState("");
  const [provisionImageRef, setProvisionImageRef] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);

  // Upgrade form
  const [upgradeImageRef, setUpgradeImageRef] = useState("");
  const [upgrading, setUpgrading] = useState(false);

  // Per-row action state
  const [rowActioning, setRowActioning] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) setToken(stored);
  }, []);

  useEffect(() => {
    if (token) {
      fetchFleet();
      fetchUpgrades();
    }
  }, [token]);

  async function login() {
    if (!usernameInput || !passwordInput) return;
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/v1/network/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (!data.token) {
        throw new Error("Login response missing token");
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setPasswordInput("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setFleet(null);
    setUpgrades(null);
  }

  async function fetchFleet() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/network/admin/fleet", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setError("Token rejected. Please re-enter admin token.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FleetResponse = await res.json();
      setFleet(data.workspaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fleet");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUpgrades() {
    if (!token) return;
    try {
      const res = await fetch("/api/v1/network/admin/upgrades?limit=5", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setUpgrades(data.upgrades ?? []);
    } catch {
      // Upgrade history is optional — silent fail
    }
  }

  async function provisionWorkspace() {
    if (!token || !provisionUserId.trim()) return;
    setProvisioning(true);
    setProvisionResult(null);
    setError(null);
    try {
      const body: { userId: string; imageRef?: string } = {
        userId: provisionUserId.trim(),
      };
      if (provisionImageRef.trim()) body.imageRef = provisionImageRef.trim();

      const res = await fetch("/api/v1/network/admin/provision", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setProvisionResult(data);
      setProvisionUserId("");
      setProvisionImageRef("");
      await fetchFleet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provision failed");
    } finally {
      setProvisioning(false);
    }
  }

  async function deprovisionWorkspace(userId: string) {
    if (!token) return;
    const confirmation = prompt(
      `Type the userId to confirm permanent deletion (deletes Railway service + volume + revokes token):\n\n${userId}`,
    );
    if (confirmation !== userId) return;
    setRowActioning(userId);
    setError(null);
    try {
      const res = await fetch("/api/v1/network/admin/deprovision", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await fetchFleet();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deprovision failed");
    } finally {
      setRowActioning(null);
    }
  }

  async function upgradeFleet() {
    if (!token || !upgradeImageRef.trim()) return;
    if (
      !confirm(
        `Upgrade ALL ${fleet?.length ?? 0} workspaces to:\n${upgradeImageRef}\n\nCanary-first; circuit-breaks after 2 consecutive failures.`,
      )
    ) {
      return;
    }
    setUpgrading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/network/admin/upgrade", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageRef: upgradeImageRef.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setUpgradeImageRef("");
      await fetchUpgrades();
      alert(`Upgrade started (id ${data.upgradeId}). Status will appear in upgrade history.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
    } finally {
      setUpgrading(false);
    }
  }

  async function rollbackFleet() {
    if (!token) return;
    if (!confirm("Rollback ALL workspaces to their pre-upgrade images from the most recent upgrade?")) {
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/v1/network/admin/rollback", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await fetchFleet();
      await fetchUpgrades();
      alert("Rollback complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed");
    }
  }

  // ============================================================
  // Token gate
  // ============================================================

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <nav className="flex items-center justify-between px-6 py-5 md:px-10">
          <Link href="/" className="text-xl font-bold text-vivid">
            ditto
          </Link>
          <span className="text-sm text-text-muted">Admin / Fleet</span>
        </nav>
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <Server size={32} className="mx-auto text-vivid mb-3" />
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Fleet Admin</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Sign in with the <code className="text-xs">ADMIN_USERNAME</code> / <code className="text-xs">ADMIN_PASSWORD</code> set on this Network Service. We&apos;ll exchange them for a Bearer token.
            </p>
            <input
              type="text"
              placeholder="Username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              disabled={loggingIn}
              className="mt-6 w-full rounded-lg border border-border px-5 py-3 text-base focus:border-vivid focus:outline-none disabled:opacity-50"
            />
            <input
              type="password"
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              disabled={loggingIn}
              className="mt-3 w-full rounded-lg border border-border px-5 py-3 text-base focus:border-vivid focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={login}
              disabled={loggingIn || !usernameInput || !passwordInput}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {loggingIn ? (
                <><Loader2 size={16} className="animate-spin" /> Signing in…</>
              ) : (
                "Sign in"
              )}
            </button>
            {loginError && (
              <p className="mt-3 text-xs text-red-600">
                <AlertCircle size={12} className="inline mr-1" />
                {loginError}
              </p>
            )}
            <p className="mt-4 text-xs text-text-muted">
              Token returned by <code>/api/v1/network/admin/login</code> is stored in <code>localStorage</code> as <code>ditto-admin-token</code>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ============================================================
  // Fleet dashboard
  // ============================================================

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-border bg-surface px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} /> Back to admin
          </Link>
          <span className="text-sm text-text-muted">/</span>
          <span className="text-sm font-medium text-text-primary">Fleet</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              fetchFleet();
              fetchUpgrades();
            }}
            disabled={loading}
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={logout}
            className="text-sm text-text-muted hover:text-text-secondary"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-negative/10 p-3 text-sm text-negative">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Provision new workspace */}
        <section className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-medium)]">
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-text-primary">
            Provision new workspace
          </h2>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              type="text"
              placeholder="userId (e.g. tim)"
              value={provisionUserId}
              onChange={(e) => setProvisionUserId(e.target.value)}
              disabled={provisioning}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm focus:border-vivid focus:outline-none disabled:opacity-50"
            />
            <input
              type="text"
              placeholder="imageRef override (optional, e.g. ghcr.io/.../ditto-os:v1.0.0)"
              value={provisionImageRef}
              onChange={(e) => setProvisionImageRef(e.target.value)}
              disabled={provisioning}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm focus:border-vivid focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={provisionWorkspace}
              disabled={provisioning || !provisionUserId.trim()}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {provisioning ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Provisioning… (1-3 min)
                </>
              ) : (
                <>
                  <Plus size={14} /> Provision
                </>
              )}
            </button>
          </div>
          {provisionResult && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-positive/10 p-3 text-sm text-positive">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  {provisionResult.status === "existing"
                    ? "Workspace already existed (idempotent return)"
                    : "Workspace provisioned"}
                </p>
                <a
                  href={provisionResult.workspaceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs underline"
                >
                  {provisionResult.workspaceUrl} <ExternalLink size={10} />
                </a>
                {provisionResult.serviceId && (
                  <p className="mt-1 font-mono text-xs">serviceId: {provisionResult.serviceId}</p>
                )}
                <p className="mt-1 text-xs">
                  Welcome email with magic link sent to user (if AgentMail is configured).
                </p>
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-text-muted">
            Saga creates Railway service + volume, injects env vars (including <code>NETWORK_AUTH_SECRET</code>), deploys, runs two-phase health check, sends magic-link welcome email. Idempotent — re-running with same userId returns existing URL. Full rollback on any failure.
          </p>
        </section>

        {/* Fleet list */}
        <section className="mb-8">
          <h2 className="mb-3 text-2xl font-semibold tracking-tight text-text-primary">
            Fleet ({fleet?.length ?? 0})
          </h2>
          {loading && !fleet && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="animate-spin" size={16} /> Loading fleet…
            </div>
          )}
          {fleet && fleet.length === 0 && (
            <div className="rounded-3xl border border-border bg-surface p-8 text-center text-sm text-text-muted shadow-[var(--shadow-medium)]">
              No workspaces provisioned yet. Use the form above to provision the first one.
            </div>
          )}
          {fleet && fleet.length > 0 && (
            <div className="overflow-x-auto rounded-3xl border border-border bg-surface shadow-[var(--shadow-medium)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle/50 text-left text-text-muted">
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">Image</th>
                    <th className="px-4 py-3">Last Health</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fleet.map((ws) => (
                    <tr key={ws.id} className="border-b border-border last:border-0 hover:bg-surface-subtle/50">
                      <td className="px-4 py-3">{statusBadge(ws.status, ws.lastHealthStatus)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{ws.userId}</td>
                      <td className="px-4 py-3">
                        <a
                          href={ws.workspaceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-vivid hover:underline"
                        >
                          {ws.workspaceUrl.replace(/^https?:\/\//, "")}
                          <ExternalLink size={10} />
                        </a>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">
                        {ws.imageRef.split("/").pop()}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {timeAgo(ws.lastHealthCheckAt)}
                        {ws.lastHealthStatus && (
                          <span className="ml-1 text-text-muted">
                            ({ws.lastHealthStatus})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => deprovisionWorkspace(ws.userId)}
                          disabled={rowActioning === ws.userId}
                          className="ml-auto flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {rowActioning === ws.userId ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Deprovision
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Fleet-wide actions */}
        <section className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-medium)]">
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-text-primary">Fleet-wide actions</h2>
          <div className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                placeholder="new imageRef (e.g. ghcr.io/launchpathventures/ditto-os:v1.1.0)"
                value={upgradeImageRef}
                onChange={(e) => setUpgradeImageRef(e.target.value)}
                disabled={upgrading}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm focus:border-vivid focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={upgradeFleet}
                disabled={upgrading || !upgradeImageRef.trim() || !fleet || fleet.length === 0}
                className="flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                {upgrading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Starting…
                  </>
                ) : (
                  <>
                    <ArrowUp size={14} /> Upgrade fleet
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              Canary-first: upgrades 1 workspace, waits for health check, continues if healthy. Circuit-breaks after 2 consecutive failures. Returns immediately with <code>upgradeId</code>; progress visible in history below.
            </p>

            <div className="border-t border-border pt-3">
              <button
                onClick={rollbackFleet}
                disabled={!fleet || fleet.length === 0}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-2 text-sm font-semibold text-negative hover:bg-negative/5 disabled:opacity-50"
              >
                <RotateCcw size={14} /> Rollback last upgrade
              </button>
              <p className="mt-2 text-xs text-text-muted">
                Each workspace reverts to its own pre-upgrade image (per-workspace rollback, not a global one).
              </p>
            </div>
          </div>
        </section>

        {/* Upgrade history */}
        {upgrades && upgrades.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-text-primary">Recent upgrades</h2>
            <div className="overflow-x-auto rounded-3xl border border-border bg-surface shadow-[var(--shadow-medium)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle/50 text-left text-text-muted">
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Image</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Counts</th>
                    <th className="px-4 py-3">Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {upgrades.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface-subtle/50">
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-text-primary">{u.status}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">
                        {u.imageRef.split("/").pop()}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {timeAgo(u.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {u.totalCount !== null
                          ? `${u.succeededCount ?? 0}/${u.totalCount} ok, ${u.failedCount ?? 0} failed`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">{u.triggeredBy ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
