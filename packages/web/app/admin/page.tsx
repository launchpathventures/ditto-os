"use client";

/**
 * Admin — Alex's Teammate View
 *
 * See what Alex is working on for every user in the network.
 * Audit communications, review plans, and provide feedback
 * as if you're Alex's colleague offering support and advice.
 *
 * Auth: requires admin token stored in localStorage.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  Mail,
  Clock,
  Brain,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";

// ============================================================
// Types (matches API response)
// ============================================================

interface PersonSummary {
  id: string;
  name: string;
  email: string | null;
  organization: string | null;
  role: string | null;
  journeyLayer: string;
  trustLevel: string;
  personaAssignment: string | null;
  source: string;
  createdAt: number;
  lastInteractionAt: number | null;
}

interface ActiveWork {
  runId: string;
  processName: string;
  processSlug: string | null;
  status: string;
  currentStep: string | null;
  startedAt: number | null;
  confidence: string | null;
}

interface RecentComm {
  type: string;
  channel: string;
  mode: string | null;
  subject: string | null;
  summary: string | null;
  outcome: string | null;
  createdAt: number;
}

interface PersonMemory {
  content: string;
  type: string;
  confidence: number;
  reinforcementCount: number;
}

interface TeammateEntry {
  person: PersonSummary;
  activeWork: ActiveWork[];
  recentComms: RecentComm[];
  memories: PersonMemory[];
  lastComm: {
    type: string;
    subject: string | null;
    outcome: string | null;
    createdAt: number;
  } | null;
  stats: {
    totalInteractions: number;
    hasActiveWork: boolean;
    memoryCount: number;
  };
}

interface TeammateResponse {
  people: TeammateEntry[];
  total: number;
  activePeopleCount: number;
  totalActiveRuns: number;
}

// ============================================================
// Helpers
// ============================================================

const TOKEN_KEY = "ditto-admin-token";

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return "never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function commTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    outreach_sent: "Outreach sent",
    reply_received: "Reply received",
    reply_sent: "Reply sent",
    introduction_made: "Intro made",
    introduction_received: "Intro received",
    meeting_booked: "Meeting booked",
    follow_up: "Follow-up",
    nurture: "Nurture",
    opt_out: "Opted out",
  };
  return labels[type] ?? type;
}

function outcomeColor(outcome: string | null): string {
  if (outcome === "positive") return "text-green-600";
  if (outcome === "negative") return "text-red-500";
  if (outcome === "no_response") return "text-text-muted";
  return "text-text-secondary";
}

function statusIcon(status: string) {
  if (status === "running") return <Loader2 size={14} className="animate-spin text-vivid" />;
  if (status === "waiting_review" || status === "waiting_human") return <AlertCircle size={14} className="text-amber-500" />;
  if (status === "approved") return <CheckCircle2 size={14} className="text-green-600" />;
  return <Circle size={14} className="text-text-muted" />;
}

function trustBadge(level: string) {
  const colors: Record<string, string> = {
    cold: "bg-blue-50 text-blue-700",
    familiar: "bg-amber-50 text-amber-700",
    trusted: "bg-green-50 text-green-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[level] ?? "bg-gray-100 text-gray-600"}`}>
      {level}
    </span>
  );
}

function journeyBadge(layer: string) {
  const colors: Record<string, string> = {
    participant: "bg-purple-50 text-purple-700",
    active: "bg-vivid-subtle text-vivid",
    workspace: "bg-green-50 text-green-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[layer] ?? "bg-gray-100 text-gray-600"}`}>
      {layer}
    </span>
  );
}

// ============================================================
// Components
// ============================================================

function PersonCard({ entry }: { entry: TeammateEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { person, activeWork, recentComms, memories, stats } = entry;

  return (
    <div className="rounded-xl border border-border bg-white">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-4 p-5 text-left hover:bg-gray-50/50"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-vivid-subtle text-sm font-semibold text-vivid">
          {person.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-primary">{person.name}</h3>
            {journeyBadge(person.journeyLayer)}
            {trustBadge(person.trustLevel)}
            {stats.hasActiveWork && (
              <span className="inline-flex items-center gap-1 rounded-full bg-vivid-subtle px-2 py-0.5 text-xs font-medium text-vivid">
                <Loader2 size={10} className="animate-spin" /> Active
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            {[person.role, person.organization].filter(Boolean).join(" at ") || person.email || "No details yet"}
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Clock size={12} /> Joined {timeAgo(person.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Mail size={12} /> {stats.totalInteractions} comms
            </span>
            <span className="flex items-center gap-1">
              <Brain size={12} /> {stats.memoryCount} memories
            </span>
          </div>
        </div>
        <div className="shrink-0 pt-1 text-text-muted">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Active Work */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Active Work
              </h4>
              {activeWork.length === 0 ? (
                <p className="text-sm text-text-muted">No active processes</p>
              ) : (
                <div className="space-y-2">
                  {activeWork.map((work) => (
                    <div key={work.runId} className="rounded-lg border border-border bg-gray-50 p-3">
                      <div className="flex items-center gap-2">
                        {statusIcon(work.status)}
                        <span className="text-sm font-medium text-text-primary">{work.processName}</span>
                      </div>
                      {work.currentStep && (
                        <p className="mt-1 text-xs text-text-secondary">
                          Current step: <span className="font-medium">{work.currentStep}</span>
                        </p>
                      )}
                      <p className="mt-1 text-xs text-text-muted">
                        {work.status} {work.startedAt ? `\u2022 started ${timeAgo(work.startedAt)}` : ""}
                        {work.confidence ? ` \u2022 confidence: ${work.confidence}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Communications */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Recent Communications
              </h4>
              {recentComms.length === 0 ? (
                <p className="text-sm text-text-muted">No communications yet</p>
              ) : (
                <div className="space-y-2">
                  {recentComms.map((comm, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">
                            {commTypeLabel(comm.type)}
                          </span>
                          {comm.outcome && (
                            <span className={`text-xs ${outcomeColor(comm.outcome)}`}>
                              {comm.outcome}
                            </span>
                          )}
                        </div>
                        {comm.subject && (
                          <p className="text-xs text-text-secondary">{comm.subject}</p>
                        )}
                        {comm.summary && (
                          <p className="text-xs text-text-muted line-clamp-2">{comm.summary}</p>
                        )}
                        <p className="text-xs text-text-muted">{timeAgo(comm.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* What Alex Knows */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                What Alex Knows
              </h4>
              {memories.length === 0 ? (
                <p className="text-sm text-text-muted">No memories yet</p>
              ) : (
                <div className="space-y-2">
                  {memories.map((mem, i) => (
                    <div key={i} className="rounded-lg bg-gray-50 p-2.5">
                      <p className="text-sm text-text-secondary">{mem.content}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {mem.type} \u2022 confidence {Math.round(mem.confidence * 100)}%
                        {mem.reinforcementCount > 1 ? ` \u2022 reinforced ${mem.reinforcementCount}x` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

// ============================================================
// User Oversight Types (Brief 108)
// ============================================================

interface UserHealthSummary {
  id: string;
  name: string | null;
  email: string;
  status: string;
  processCount: number;
  lastActivity: string | null;
  health: "green" | "yellow" | "red";
  pausedAt: string | null;
  recentDowngrades: number;
}

function healthDot(health: "green" | "yellow" | "red") {
  const colors = { green: "bg-green-500", yellow: "bg-yellow-500", red: "bg-red-500" };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[health]}`} />;
}

export default function AdminTeammatePage() {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<TeammateResponse | null>(null);
  const [userOverview, setUserOverview] = useState<UserHealthSummary[] | null>(null);

  // Check for stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
      fetchData(stored);
    }
  }, []);

  async function fetchData(authToken: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/network/admin/teammate", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 401 || res.status === 403) {
        setAuthenticated(false);
        localStorage.removeItem(TOKEN_KEY);
        setError("Session expired. Please log in again.");
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      setData(json);
      setAuthenticated(true);
      localStorage.setItem(TOKEN_KEY, authToken);
      // Brief 108: Also fetch user oversight data
      try {
        const usersRes = await fetch("/api/v1/network/admin/users", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (usersRes.ok) {
          const usersJson = await usersRes.json();
          setUserOverview(usersJson.users);
        }
      } catch { /* User oversight fetch is optional — don't fail the page */ }
    } catch {
      setError("Failed to load data. Check your connection.");
    }
    setLoading(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError("");

    try {
      const loginRes = await fetch("/api/v1/network/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      if (loginRes.status === 401) {
        setError("Invalid username or password.");
        setLoading(false);
        return;
      }
      if (!loginRes.ok) {
        const body = await loginRes.json().catch(() => ({}));
        setError(body.error || "Login failed.");
        setLoading(false);
        return;
      }

      const { token: newToken } = await loginRes.json();
      setToken(newToken);
      await fetchData(newToken);
    } catch {
      setError("Login failed. Check your connection.");
      setLoading(false);
    }
  }

  // ============================================================
  // Auth gate
  // ============================================================

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <nav className="flex items-center justify-between px-6 py-5 md:px-10">
          <Link href="/" className="text-xl font-bold text-vivid">ditto</Link>
          <span className="text-sm text-text-muted">Admin</span>
        </nav>
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-text-primary">Alex&apos;s Teammate View</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Log in to see what Alex is working on across the network.
            </p>
            <form onSubmit={handleLogin} className="mt-6 space-y-3">
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                className="w-full rounded-2xl border-2 border-border bg-white px-4 py-3 text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-2xl border-2 border-border bg-white px-4 py-3 text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !username.trim() || !password.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-vivid px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                {loading ? "Logging in..." : "Log in"}
              </button>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ============================================================
  // Teammate dashboard
  // ============================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-border bg-white px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-bold text-vivid">ditto</Link>
          <span className="text-sm text-text-muted">/</span>
          <span className="text-sm font-medium text-text-primary">Alex&apos;s Teammate View</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/smoke-tests"
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Smoke Tests
          </Link>
          <button
            onClick={() => fetchData(token)}
            disabled={loading}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={() => {
              localStorage.removeItem(TOKEN_KEY);
              setAuthenticated(false);
              setData(null);
            }}
            className="text-sm text-text-muted hover:text-text-secondary"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        {/* Summary stats */}
        {data && (
          <div className="mb-8 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 text-text-muted">
                <Users size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">People</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-text-primary">{data.total}</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 text-text-muted">
                <Loader2 size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">Active Work</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-text-primary">{data.activePeopleCount}</p>
              <p className="text-xs text-text-muted">{data.totalActiveRuns} runs</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 text-text-muted">
                <Clock size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">Newest</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-text-primary">
                {data.people.length > 0 ? timeAgo(data.people[0].person.createdAt) : "—"}
              </p>
            </div>
          </div>
        )}

        {/* User Oversight — Brief 108 */}
        {userOverview && userOverview.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-text-primary mb-3">
              User Oversight ({userOverview.length} users)
            </h2>
            <div className="rounded-xl border border-border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted border-b bg-gray-50/50">
                    <th className="px-4 py-3">Health</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Processes</th>
                    <th className="px-4 py-3">Last Activity</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {userOverview.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-3">{healthDot(u.health)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="text-vivid hover:underline font-medium"
                        >
                          {u.name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                      <td className="px-4 py-3">{u.processCount}</td>
                      <td className="px-4 py-3 text-text-muted">
                        {u.lastActivity ? timeAgo(new Date(u.lastActivity).getTime()) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {u.pausedAt ? (
                          <span className="text-xs text-red-600 font-medium">PAUSED</span>
                        ) : (
                          <span className="text-xs text-text-muted">{u.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* People list */}
        {data && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">
              Alex&apos;s Network ({data.total} people)
            </h2>
            {data.people.length === 0 ? (
              <div className="rounded-xl border border-border bg-white p-8 text-center">
                <p className="text-text-muted">No people in the network yet. They&apos;ll appear here after someone chats with Alex on the front door.</p>
              </div>
            ) : (
              data.people.map((entry) => (
                <PersonCard key={entry.person.id} entry={entry} />
              ))
            )}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-vivid" />
          </div>
        )}
      </main>
    </div>
  );
}
