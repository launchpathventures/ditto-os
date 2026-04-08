"use client";

/**
 * Admin — Per-User Detail (Brief 108 AC2-6)
 *
 * Shows processes, trust tiers, recent runs, quality metrics,
 * and admin actions (pause, resume, feedback, act-as-Alex).
 */

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Pause,
  Play,
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Shield,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface ProcessInfo {
  id: string;
  name: string;
  slug: string;
  trustTier: string;
  status: string;
}

interface RunInfo {
  id: string;
  processName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface FeedbackEntry {
  id: string;
  feedback: string;
  createdBy: string;
  createdAt: string;
}

interface UserDetailData {
  id: string;
  name: string | null;
  email: string;
  status: string;
  businessContext: string | null;
  pausedAt: string | null;
  createdAt: string;
  processes: ProcessInfo[];
  recentRuns: RunInfo[];
  qualityMetrics: {
    totalRuns: number;
    approvedRuns: number;
    rejectedRuns: number;
    editedRuns: number;
    approvalRate: number;
    editRate: number;
  };
  adminFeedback: FeedbackEntry[];
}

// ============================================================
// Helpers
// ============================================================

const TOKEN_KEY = "ditto-admin-token";

function trustTierBadge(tier: string) {
  const colors: Record<string, string> = {
    autonomous: "bg-green-100 text-green-800",
    spot_checked: "bg-yellow-100 text-yellow-800",
    supervised: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[tier] ?? "bg-gray-100 text-gray-600"}`}>
      {tier}
    </span>
  );
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    approved: "text-green-600",
    running: "text-blue-600",
    queued: "text-gray-500",
    failed: "text-red-600",
    waiting_review: "text-yellow-600",
    waiting_human: "text-orange-600",
  };
  return <span className={`text-sm font-medium ${colors[status] ?? "text-gray-600"}`}>{status}</span>;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ============================================================
// Component
// ============================================================

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const [token, setToken] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [showActAs, setShowActAs] = useState(false);
  const [actAsForm, setActAsForm] = useState({ to: "", subject: "", body: "", personId: "" });

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) setToken(stored);
  }, []);

  const fetchDetail = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/network/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchDetail();
  }, [token, userId]);

  const doAction = async (action: string, extra?: Record<string, unknown>) => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/network/admin/users/${userId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await fetchDetail(); // Refresh
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">
          Not authenticated.{" "}
          <Link href="/admin" className="text-blue-600 underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">
      <Link href="/admin" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={14} /> Back to dashboard
      </Link>

      {loading && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="animate-spin" size={16} /> Loading...
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded">
          <AlertCircle size={14} className="inline mr-1" /> {error}
        </div>
      )}

      {detail && (
        <>
          {/* Header */}
          <div className="bg-white rounded-lg border p-6 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold">{detail.name ?? detail.email}</h1>
                <p className="text-sm text-gray-500">{detail.email}</p>
                {detail.businessContext && (
                  <p className="text-sm text-gray-600 mt-1">{detail.businessContext}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">User since {new Date(detail.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                {detail.pausedAt ? (
                  <button
                    onClick={() => doAction("resume")}
                    disabled={actionLoading}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    <Play size={14} /> Resume Alex
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm("This will halt all Alex activity for this user. Continue?")) {
                        doAction("pause");
                      }
                    }}
                    disabled={actionLoading}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                  >
                    <Pause size={14} /> Pause Alex
                  </button>
                )}
              </div>
            </div>
            {detail.pausedAt && (
              <div className="mt-3 bg-red-50 text-red-700 text-sm p-2 rounded flex items-center gap-1">
                <Pause size={14} /> Alex paused since {new Date(detail.pausedAt).toLocaleString()}
              </div>
            )}
          </div>

          {/* Quality Metrics */}
          <div className="bg-white rounded-lg border p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Quality Metrics</h2>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-semibold">{detail.qualityMetrics.totalRuns}</div>
                <div className="text-xs text-gray-500">Total Feedback</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-green-600">{pct(detail.qualityMetrics.approvalRate)}</div>
                <div className="text-xs text-gray-500">Approval Rate</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-yellow-600">{pct(detail.qualityMetrics.editRate)}</div>
                <div className="text-xs text-gray-500">Edit Rate</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-red-600">{detail.qualityMetrics.rejectedRuns}</div>
                <div className="text-xs text-gray-500">Rejections</div>
              </div>
            </div>
          </div>

          {/* Processes with trust tiers */}
          <div className="bg-white rounded-lg border p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
              <Shield size={14} /> Processes & Trust Tiers
            </h2>
            {detail.processes.length === 0 ? (
              <p className="text-sm text-gray-400">No active processes</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Process</th>
                    <th className="pb-2">Trust Tier</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.processes.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2">{p.name}</td>
                      <td className="py-2">{trustTierBadge(p.trustTier)}</td>
                      <td className="py-2">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent Runs */}
          <div className="bg-white rounded-lg border p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
              <Clock size={14} /> Recent Runs (last 10)
            </h2>
            {detail.recentRuns.length === 0 ? (
              <p className="text-sm text-gray-400">No runs yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Process</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.recentRuns.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2">{r.processName}</td>
                      <td className="py-2">{statusBadge(r.status)}</td>
                      <td className="py-2 text-gray-500">
                        {r.startedAt ? new Date(r.startedAt).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Admin Feedback */}
          <div className="bg-white rounded-lg border p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
              <MessageSquare size={14} /> Admin Feedback
            </h2>
            {detail.adminFeedback.length > 0 && (
              <div className="space-y-2 mb-3">
                {detail.adminFeedback.map((f) => (
                  <div key={f.id} className="bg-gray-50 p-2 rounded text-sm">
                    <p>{f.feedback}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      by {f.createdBy} — {new Date(f.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add guidance for Alex about this user..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="flex-1 border rounded px-3 py-1.5 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && feedbackText.trim()) {
                    doAction("feedback", { feedback: feedbackText.trim() });
                    setFeedbackText("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (feedbackText.trim()) {
                    doAction("feedback", { feedback: feedbackText.trim() });
                    setFeedbackText("");
                  }
                }}
                disabled={actionLoading || !feedbackText.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          {/* Act as Alex */}
          <div className="bg-white rounded-lg border p-4 mb-4">
            <button
              onClick={() => setShowActAs(!showActAs)}
              className="text-sm font-semibold text-gray-700 flex items-center gap-1 hover:text-gray-900"
            >
              <Send size={14} /> Act as Alex {showActAs ? "(hide)" : "(show)"}
            </button>
            {showActAs && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-500">
                  Compose and send an email from Alex&apos;s inbox. For edge cases only.
                </p>
                <input
                  type="text"
                  placeholder="To (email)"
                  value={actAsForm.to}
                  onChange={(e) => setActAsForm({ ...actAsForm, to: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                />
                <input
                  type="text"
                  placeholder="Person ID"
                  value={actAsForm.personId}
                  onChange={(e) => setActAsForm({ ...actAsForm, personId: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                />
                <input
                  type="text"
                  placeholder="Subject"
                  value={actAsForm.subject}
                  onChange={(e) => setActAsForm({ ...actAsForm, subject: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                />
                <textarea
                  placeholder="Message body"
                  value={actAsForm.body}
                  onChange={(e) => setActAsForm({ ...actAsForm, body: e.target.value })}
                  className="w-full border rounded px-3 py-1.5 text-sm h-24"
                />
                <button
                  onClick={() => {
                    if (confirm("Send this email from Alex's inbox?")) {
                      doAction("act_as_alex", actAsForm);
                    }
                  }}
                  disabled={actionLoading || !actAsForm.to || !actAsForm.subject || !actAsForm.body || !actAsForm.personId}
                  className="px-3 py-1.5 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 disabled:opacity-50"
                >
                  Send as Alex
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
