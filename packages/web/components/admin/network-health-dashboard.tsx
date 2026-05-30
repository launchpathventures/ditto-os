"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  Filter,
  LockKeyhole,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  XCircle,
} from "lucide-react";
import {
  ADMIN_DECISION_REASON_GROUPS,
  ADMIN_DRY_RUN_REASON_OPTIONS,
  ADMIN_PAUSE_REASON_OPTIONS,
  ADMIN_REVEAL_REASON_OPTIONS,
} from "@/lib/network-admin-reveal-reasons";

const TOKEN_KEY = "ditto-admin-token";

type HealthTone = "green" | "yellow" | "red";
type DecisionAction = "approve" | "suppress";

interface AdminActionItem {
  id: string;
  kind: string;
  title: string;
  detail: string;
  reasonCode: string | null;
  subjectType: string;
  subjectId: string;
  createdAt: string;
  revealable: boolean;
  decision?: {
    kind: "claim_invite_candidate";
    candidateId: string;
  } | null;
}

interface AdminHealthCard {
  id: string;
  title: string;
  status: HealthTone;
  count: number;
  detail: string;
}

interface AdminMetric {
  id: string;
  label: string;
  value: number | string;
  detail: string;
  displayOnly?: boolean;
}

interface AdminAuditRow {
  id: string;
  eventClass: string;
  subjectType: string;
  subjectId: string;
  actorType: string;
  actorId: string | null;
  reasonCode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  revealable: boolean;
}

interface AdminSuppressionRow {
  id: string;
  identifierKind: string;
  scope: string;
  scopeUserId: string | null;
  reason: string;
  source: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface NetworkHealthDashboardData {
  generatedAt: string;
  actionRequired: {
    total: number;
    items: AdminActionItem[];
  };
  health: AdminHealthCard[];
  metrics: AdminMetric[];
  auditRows: AdminAuditRow[];
  suppressionRows: AdminSuppressionRow[];
  allClear: boolean;
}

interface RevealedAdminRawText {
  auditEventId: string;
  sourceEventId: string;
  field: string;
  rawText: string;
  revealedBy: string;
  revealedAt: string;
  annotation: "Revealed — this view is audited";
}

interface DryRunWatchReplayResult {
  auditEventId: string;
  watchId: string;
  label: "DRY RUN — no contact occurred";
  banner: "DRY RUN — no contact";
  assertions: {
    emailsSent: 0;
    notificationsSent: 0;
    userVisibleWrites: 0;
  };
  candidatesResolved: number;
  completedAt: string;
}

interface PauseState {
  paused: boolean;
  changedAt: string | null;
  reason: string | null;
  actorId: string | null;
  stepRunId: string | null;
}

interface ActionLog {
  id: string;
  at: string;
  ok: boolean;
  detail: string;
}

type NewActionLog = Omit<ActionLog, "id">;

export interface NetworkHealthDashboardProps {
  token: string | null;
  initialData?: NetworkHealthDashboardData | null;
}

const DECISION_REASON_VALUES = new Set(
  ADMIN_DECISION_REASON_GROUPS.flatMap((group) =>
    group.options.map((option) => option.value),
  ),
);

function canMutateQueueItem(item: AdminActionItem): boolean {
  return item.decision?.kind === "claim_invite_candidate" && Boolean(item.decision.candidateId);
}

function auditEventIdFromPayload(payload: Record<string, unknown>): string | null {
  if (typeof payload.auditEventId === "string") return payload.auditEventId;
  for (const key of ["revealed", "result"]) {
    const nested = payload[key];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const auditEventId = (nested as Record<string, unknown>).auditEventId;
    if (typeof auditEventId === "string") return auditEventId;
  }
  return null;
}

export function actionLogDetail(
  path: string,
  ok: boolean,
  status: number,
  payload: Record<string, unknown>,
): string {
  if (!ok) return String(payload.error ?? `HTTP ${status}`);

  const auditEventId = auditEventIdFromPayload(payload);
  const auditLabel = auditEventId ? ` (audit ${auditEventId})` : "";
  if (path.includes("/reveal")) return `raw text revealed${auditLabel}`;
  if (path.includes("/dry-run")) return `dry-run complete${auditLabel}`;
  if (path.includes("/approve")) return `approved${auditLabel}`;
  if (path.includes("/suppress")) return `suppressed${auditLabel}`;
  if (path.includes("/pause-discovery")) return "control applied";
  return "ok";
}

function shortDate(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function labelFromCode(value: string | null | undefined): string {
  if (!value) return "No reason";
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function valueString(value: unknown): string {
  if (value == null) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length ? value.map(valueString).join(", ") : "none";
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${labelFromCode(key)}: ${valueString(entry)}`)
      .join(" - ");
  }
  return String(value);
}

function metadataEntries(metadata: Record<string, unknown> | null) {
  if (!metadata) return [];
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    label: labelFromCode(key),
    value: valueString(value),
  }));
}

function toneBadgeClasses(tone: HealthTone): string {
  if (tone === "green") return "bg-positive/10 text-positive";
  if (tone === "red") return "bg-negative/10 text-negative";
  return "bg-caution/10 text-caution";
}

function toneDotClasses(tone: HealthTone): string {
  if (tone === "green") return "bg-positive";
  if (tone === "red") return "bg-negative";
  return "bg-caution";
}

function auditBadgeClasses(eventClass: string): string {
  if (/reveal|dry|override/i.test(eventClass)) {
    return "bg-vivid-subtle text-vivid-deep";
  }
  if (/suppress|delete|block|fail|complaint/i.test(eventClass)) {
    return "bg-negative/10 text-negative";
  }
  if (/approve|claim|share|intro/i.test(eventClass)) {
    return "bg-positive/10 text-positive";
  }
  return "bg-surface-raised text-text-secondary";
}

function sectionCountLabel(loaded: number, total: number): string {
  if (total > loaded) return `Showing ${loaded} of ${total}`;
  return `${loaded} total`;
}

let actionLogSequence = 0;

function createActionLogId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  actionLogSequence += 1;
  return `action-log-${Date.now()}-${actionLogSequence}`;
}

export function NetworkHealthDashboard({
  token,
  initialData = null,
}: NetworkHealthDashboardProps) {
  const [data, setData] = useState<NetworkHealthDashboardData | null>(initialData);
  const [loading, setLoading] = useState(!initialData && Boolean(token));
  const [error, setError] = useState<string | null>(null);
  const [pauseState, setPauseState] = useState<PauseState | null>(null);
  const [pauseLoading, setPauseLoading] = useState(Boolean(token));
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [log, setLog] = useState<ActionLog[]>([]);
  const [revealReasons, setRevealReasons] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, RevealedAdminRawText>>({});
  const [dryRun, setDryRun] = useState<DryRunWatchReplayResult | null>(null);
  const [actionReasons, setActionReasons] = useState<Record<string, string>>({});
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState("all");

  const headers = useMemo<Record<string, string>>(() => {
    const nextHeaders: Record<string, string> = { "content-type": "application/json" };
    if (token) nextHeaders.authorization = `Bearer ${token}`;
    return nextHeaders;
  }, [token]);

  const auditRows = data?.auditRows ?? [];
  const auditEventClasses = useMemo(
    () => Array.from(new Set(auditRows.map((row) => row.eventClass))).sort(),
    [auditRows],
  );
  const filteredAuditRows = useMemo(
    () =>
      auditFilter === "all"
        ? auditRows
        : auditRows.filter((row) => row.eventClass === auditFilter),
    [auditFilter, auditRows],
  );

  const appendLog = useCallback((entry: NewActionLog) => {
    setLog((prev) => [{ id: createActionLogId(), ...entry }, ...prev].slice(0, 20));
  }, []);

  const refreshHealth = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/network/admin/superconnector/health", {
        headers,
      });
      const payload = (await res.json()) as {
        data?: NetworkHealthDashboardData;
        error?: string;
      };
      if (!res.ok || !payload.data) {
        setError(payload.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(payload.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
    } finally {
      setLoading(false);
    }
  }, [headers, token]);

  const refreshPause = useCallback(async () => {
    if (!token) return;
    setPauseLoading(true);
    try {
      const res = await fetch(
        "/api/v1/network/admin/superconnector/pause-discovery",
        { headers },
      );
      const payload = (await res.json()) as { state?: PauseState; error?: string };
      if (!res.ok || !payload.state) {
        setPauseState(null);
        setPauseError(payload.error ?? `HTTP ${res.status}`);
        return;
      }
      setPauseState(payload.state);
      setPauseError(null);
    } catch (err) {
      setPauseState(null);
      setPauseError(err instanceof Error ? err.message : "request_failed");
    } finally {
      setPauseLoading(false);
    }
  }, [headers, token]);

  useEffect(() => {
    if (!initialData) void refreshHealth();
    void refreshPause();
  }, [initialData, refreshHealth, refreshPause]);

  async function postAction(path: string, body: Record<string, unknown>) {
    if (!token) return { ok: false, detail: "Admin token required." };
    const res = await fetch(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = (await res.json()) as Record<string, unknown>;
    return {
      ok: res.ok,
      payload,
      detail: actionLogDetail(path, res.ok, res.status, payload),
    };
  }

  function formValue(form: HTMLFormElement, name: string): string {
    return String(new FormData(form).get(name) ?? "").trim();
  }

  function decisionReason(item: AdminActionItem): string {
    const selected = actionReasons[item.id];
    if (selected) return selected;
    if (item.reasonCode && DECISION_REASON_VALUES.has(item.reasonCode)) {
      return item.reasonCode;
    }
    return "operator-reviewed";
  }

  function revealReason(row: AdminAuditRow): string {
    return revealReasons[row.id] || ADMIN_REVEAL_REASON_OPTIONS[0].value;
  }

  function resetItemDecision(itemId: string) {
    setActionReasons((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setActionNotes((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  async function handleQueueDecision(item: AdminActionItem, action: DecisionAction) {
    if (!canMutateQueueItem(item)) {
      appendLog({
        at: new Date().toISOString(),
        ok: false,
        detail: `${action} ${item.subjectId} -> action_not_available_for_${item.kind}`,
      });
      return;
    }
    const pendingKey = `${action}:${item.id}`;
    const candidateId = item.decision?.candidateId;
    if (!candidateId) {
      appendLog({
        at: new Date().toISOString(),
        ok: false,
        detail: `${action} ${item.subjectId} -> candidate_id_unavailable`,
      });
      return;
    }
    const reason = decisionReason(item);
    setActionPending(pendingKey);
    const path =
      action === "approve"
        ? "/api/v1/network/admin/superconnector/approve"
        : "/api/v1/network/admin/superconnector/suppress";
    try {
      const result = await postAction(path, {
        candidateId,
        reason,
        notes: actionNotes[item.id]?.trim() || undefined,
      });
      appendLog({
        at: new Date().toISOString(),
        ok: result.ok,
        detail: `${action} ${candidateId} (${reason}) -> ${result.detail}`,
      });
      if (result.ok) {
        resetItemDecision(item.id);
        void refreshHealth();
      }
    } catch (err) {
      appendLog({
        at: new Date().toISOString(),
        ok: false,
        detail: `${action} ${candidateId} (${reason}) -> ${
          err instanceof Error ? err.message : "request_failed"
        }`,
      });
    } finally {
      setActionPending((current) => (current === pendingKey ? null : current));
    }
  }

  async function handlePause(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const paused = formValue(form, "paused") === "true";
    const result = await postAction(
      "/api/v1/network/admin/superconnector/pause-discovery",
      {
        paused,
        reason: formValue(form, "reason"),
      },
    );
    appendLog({
      at: new Date().toISOString(),
      ok: result.ok,
      detail: `${paused ? "pause" : "resume"} discovery -> ${result.detail}`,
    });
    if (result.ok) {
      form.reset();
      void refreshPause();
      void refreshHealth();
    }
  }

  async function handleDryRun(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const watchId = formValue(form, "watchId");
    const result = await postAction("/api/v1/network/admin/superconnector/dry-run", {
      watchId,
      reason: formValue(form, "reason"),
    });
    appendLog({
      at: new Date().toISOString(),
      ok: result.ok,
      detail: `dry-run ${watchId} -> ${result.detail}`,
    });
    if (result.ok) {
      const payload = result.payload as { result?: DryRunWatchReplayResult };
      setDryRun(payload.result ?? null);
      form.reset();
      void refreshHealth();
    }
  }

  async function reveal(row: AdminAuditRow) {
    const reason = revealReason(row);
    if (!reason) {
      appendLog({
        at: new Date().toISOString(),
        ok: false,
        detail: `reveal ${row.id} -> reason_required`,
      });
      return;
    }
    const result = await postAction("/api/v1/network/admin/superconnector/reveal", {
      auditEventId: row.id,
      reason,
    });
    appendLog({
      at: new Date().toISOString(),
      ok: result.ok,
      detail: `reveal ${row.id} -> ${result.detail}`,
    });
    if (result.ok) {
      const payload = result.payload as { revealed?: RevealedAdminRawText };
      if (payload.revealed) {
        setRevealed((prev) => ({ ...prev, [row.id]: payload.revealed! }));
      }
      void refreshHealth();
    }
  }

  if (!token) {
    return (
      <section className="rounded-[28px] border border-border bg-white p-6 shadow-[var(--shadow-medium)]">
        <p className="text-xs font-semibold uppercase tracking-normal text-vivid-deep">
          Admin access
        </p>
        <h2 className="mt-2 text-xl font-semibold text-text-primary">Network health is sealed</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
          Admin token required. Set <code>{TOKEN_KEY}</code> in localStorage from
          the main admin page.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-10 text-text-primary">
      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-normal text-vivid-deep">
            Network trust and safety
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-text-primary">
            Superconnector health
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
            Triage first, health second, metrics last. Private member text is sealed
            by default; privileged reveals require a reason and write their own audit row.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {error ? (
            <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-negative/10 px-4 text-sm font-semibold text-negative">
              <ShieldAlert size={16} aria-hidden="true" />
              Refresh failed; showing last known data
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void refreshHealth()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-text shadow-[var(--shadow-subtle)] transition-colors hover:bg-accent-hover"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <section className="space-y-4" aria-labelledby="action-required-heading">
        <BandHeader
          icon={<SlidersHorizontal size={18} aria-hidden="true" />}
          eyebrow="Operator inbox"
          title="Action required"
          detail="Decision-bearing items stay attached to their context. No raw IDs need to be copied before approval or suppression."
          meta={
            data
              ? sectionCountLabel(data.actionRequired.items.length, data.actionRequired.total)
              : "Loading"
          }
          titleId="action-required-heading"
        />
        {error && data ? (
          <BandStaleNotice message={error} onRetry={() => void refreshHealth()} />
        ) : null}
        {loading && !data ? (
          <SkeletonBand rows={3} label="Loading action queue" />
        ) : error && !data ? (
          <BandError message={error} onRetry={() => void refreshHealth()} />
        ) : data?.allClear ? (
          <div className="rounded-[28px] border border-positive/20 bg-positive/5 p-6 shadow-[var(--shadow-subtle)]">
            <div className="flex items-center gap-3 text-sm font-semibold text-positive">
              <CheckCircle2 size={20} aria-hidden="true" />
              No items need your decision
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-positive">
              The latest audit window has no action-required network safety items.
              This is the quiet success state: no outbound or discovery work needs intervention.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-vivid-subtle-border bg-white shadow-[var(--shadow-medium)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-vivid-subtle px-5 py-3">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-vivid-deep">
                <ClipboardCheck size={16} aria-hidden="true" />
                Review queue
              </div>
              <span className="text-xs font-semibold text-vivid-deep">
                {sectionCountLabel(
                  data?.actionRequired.items.length ?? 0,
                  data?.actionRequired.total ?? 0,
                )}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {(data?.actionRequired.items ?? []).map((item) => {
                const canMutate = canMutateQueueItem(item);
                const rowLocked = actionPending?.endsWith(`:${item.id}`) ?? false;
                return (
                  <li
                    key={item.id}
                    className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-text-primary">
                          {item.title}
                        </h3>
                        <span className="rounded-full bg-vivid-subtle px-2.5 py-1 text-xs font-semibold text-vivid-deep">
                          {labelFromCode(item.reasonCode ?? item.kind)}
                        </span>
                        {item.revealable ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2.5 py-1 text-xs font-semibold text-text-secondary">
                            <LockKeyhole size={12} aria-hidden="true" />
                            Raw text sealed
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
                        {item.detail}
                      </p>
                      <dl className="mt-4 grid gap-3 text-xs text-text-muted sm:grid-cols-3">
                        <InlineFact label="Subject" value={`${item.subjectType} - ${item.subjectId}`} />
                        <InlineFact label="Created" value={shortDate(item.createdAt)} />
                        <InlineFact label="Source" value={labelFromCode(item.kind)} />
                      </dl>
                    </div>

                    {canMutate ? (
                      <div className="rounded-[22px] bg-surface-raised p-4 shadow-[var(--shadow-subtle)]">
                        <label className="block text-xs font-semibold text-text-secondary">
                          Decision reason
                          <select
                            value={decisionReason(item)}
                            disabled={rowLocked}
                            onChange={(event) =>
                              setActionReasons((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            className="mt-2 h-10 w-full rounded-full border border-border bg-white px-3 text-sm font-medium text-text-primary outline-none transition-colors focus:border-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {ADMIN_DECISION_REASON_GROUPS.map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </label>
                        <label className="mt-3 block text-xs font-semibold text-text-secondary">
                          Notes
                          <textarea
                            value={actionNotes[item.id] ?? ""}
                            disabled={rowLocked}
                            onChange={(event) =>
                              setActionNotes((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            rows={2}
                            className="mt-2 min-h-20 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="Optional context for the audit row"
                          />
                        </label>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleQueueDecision(item, "approve")}
                            disabled={rowLocked}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <CheckCircle2 size={16} aria-hidden="true" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleQueueDecision(item, "suppress")}
                            disabled={rowLocked}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-negative/30 bg-white px-4 text-sm font-semibold text-negative transition-colors hover:bg-negative/5 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <XCircle size={16} aria-hidden="true" />
                            Suppress
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[22px] bg-surface-raised p-4 shadow-[var(--shadow-subtle)]">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-text-secondary">
                          <TableProperties size={14} aria-hidden="true" />
                          Audit review
                        </div>
                        <p className="mt-3 text-sm leading-6 text-text-secondary">
                          This row is generated from an audit event. Direct claim-invite
                          mutation is hidden until the row is an active candidate decision.
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="health-heading">
        <BandHeader
          titleId="health-heading"
          title="Health"
          detail="Subsystem checks are secondary to the decision queue, but red states still become explicit alerts."
          meta={data ? `${data.health.length} checks` : "Loading"}
        />
        {error && data ? (
          <BandStaleNotice message={error} onRetry={() => void refreshHealth()} />
        ) : null}
        {loading && !data ? (
          <SkeletonBand rows={2} label="Loading health checks" />
        ) : error && !data ? (
          <BandError message={error} onRetry={() => void refreshHealth()} />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(data?.health ?? []).map((card) => (
                <article
                  key={card.id}
                  className="rounded-[24px] bg-surface-raised p-4 shadow-[var(--shadow-subtle)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${toneBadgeClasses(card.status)}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${toneDotClasses(card.status)}`}
                        aria-hidden="true"
                      />
                      {card.status}
                    </span>
                    <span className="text-xl font-semibold text-text-primary">
                      {card.count}
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-text-primary">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-text-secondary">{card.detail}</p>
                </article>
              ))}
            </div>
            {(data?.health ?? []).some(
              (card) => card.id === "leakage-tests" && card.status === "red",
            ) ? (
              <div className="rounded-[24px] border border-negative/25 bg-negative/5 p-5 text-sm text-negative shadow-[var(--shadow-subtle)]">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle size={18} aria-hidden="true" />
                  Private-leakage test failure
                </div>
                <p className="mt-2 leading-6">
                  Discovery and outbound work should stay paused until this is reviewed.
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="metrics-heading">
        <BandHeader
          titleId="metrics-heading"
          title="Metrics"
          detail="Aggregate-only signals. They explain network direction without exposing private raw text or introducing billing controls."
          meta={data ? `Generated ${shortDate(data.generatedAt)}` : "Loading"}
        />
        {error && data ? (
          <BandStaleNotice message={error} onRetry={() => void refreshHealth()} />
        ) : null}
        {loading && !data ? (
          <SkeletonBand rows={2} label="Loading metrics" />
        ) : error && !data ? (
          <BandError message={error} onRetry={() => void refreshHealth()} />
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-border bg-white shadow-[var(--shadow-medium)]">
            <div className="divide-y divide-border">
              {(data?.metrics ?? []).map((metric) => (
                <div
                  key={metric.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(220px,0.7fr)] md:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">
                        {metric.label}
                      </h3>
                      {metric.displayOnly ? (
                        <span className="rounded-full bg-surface-raised px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          display-only
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      {metric.detail}
                    </p>
                  </div>
                  <p className="text-2xl font-semibold text-text-primary">
                    {String(metric.value)}
                  </p>
                  <p className="rounded-[18px] bg-surface-raised px-4 py-3 text-xs leading-5 text-text-secondary">
                    Provenance: aggregate network-health read model - {shortDate(data?.generatedAt ?? null)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]" aria-labelledby="guarded-controls-heading">
        <div className="lg:col-span-2">
          <BandHeader
            titleId="guarded-controls-heading"
            title="Guarded controls"
            detail="State-changing controls stay visibly separate from aggregate monitoring. Every action requires a structured reason."
          />
        </div>
        <div className="rounded-[28px] border border-border bg-white p-5 shadow-[var(--shadow-medium)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Discovery controls</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Status:{" "}
                <strong>
                  {pauseLoading
                    ? "checking"
                    : pauseError || !pauseState
                      ? "unknown"
                      : pauseState.paused
                        ? "paused"
                        : "active"}
                </strong>
                {pauseState?.changedAt ? ` - ${shortDate(pauseState.changedAt)}` : ""}
              </p>
            </div>
            <span className="rounded-full bg-surface-raised px-3 py-1 text-xs font-semibold text-text-secondary">
              reason required
            </span>
          </div>
          {pauseError ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-caution/20 bg-caution/5 px-4 py-3 text-sm text-caution">
              <span className="font-semibold">Pause state unavailable - {pauseError}</span>
              <button
                type="button"
                onClick={() => void refreshPause()}
                className="inline-flex min-h-9 items-center rounded-full border border-caution/30 bg-white px-3 text-xs font-semibold text-caution transition-colors hover:bg-caution/10"
              >
                Retry
              </button>
            </div>
          ) : null}
          <form
            key={pauseState ? (pauseState.paused ? "paused" : "active") : "unknown"}
            onSubmit={handlePause}
            className="mt-4 grid gap-3"
          >
            <label className="block text-xs font-semibold text-text-secondary">
              Action
              <select
                name="paused"
                defaultValue={pauseState?.paused ? "false" : "true"}
                disabled={pauseLoading || Boolean(pauseError) || !pauseState}
                className="mt-2 h-10 w-full rounded-full border border-border bg-white px-3 text-sm font-medium text-text-primary outline-none focus:border-text-primary"
              >
                <option value="true">Pause</option>
                <option value="false">Resume</option>
              </select>
            </label>
            <SelectField
              name="reason"
              label="Reason"
              options={ADMIN_PAUSE_REASON_OPTIONS}
              disabled={pauseLoading || Boolean(pauseError) || !pauseState}
            />
            <button
              disabled={pauseLoading || Boolean(pauseError) || !pauseState}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pauseState?.paused ? <PlayCircle size={16} aria-hidden="true" /> : <PauseCircle size={16} aria-hidden="true" />}
              Apply control
            </button>
          </form>
        </div>

        <div className="rounded-[28px] border border-vivid-subtle-border bg-white p-5 shadow-[var(--shadow-medium)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-vivid-subtle px-3 py-1 text-xs font-semibold text-vivid-deep">
                <ShieldCheck size={14} aria-hidden="true" />
                No contact mode
              </div>
              <h3 className="mt-3 text-sm font-semibold text-text-primary">
                Dry-run watch replay
              </h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Candidate resolution only. No email, notification, or user-visible write occurs.
              </p>
            </div>
            {dryRun ? (
              <span className="rounded-full bg-positive/10 px-3 py-1 text-xs font-semibold text-positive">
                completed {shortDate(dryRun.completedAt)}
              </span>
            ) : null}
          </div>
          {dryRun ? (
            <div className="mt-4 rounded-[22px] bg-vivid-subtle p-4 text-sm text-vivid-deep shadow-[var(--shadow-subtle)]">
              <div className="font-semibold">{dryRun.banner}</div>
              <p className="mt-2">
                {dryRun.assertions.emailsSent} emails sent -{" "}
                {dryRun.assertions.notificationsSent} notifications -{" "}
                {dryRun.assertions.userVisibleWrites} writes
              </p>
              <p className="mt-1 text-xs">
                {dryRun.candidatesResolved} candidates resolved - audit {dryRun.auditEventId}
              </p>
            </div>
          ) : null}
          <form onSubmit={handleDryRun} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <Field name="watchId" label="Watch ID" compact />
            <SelectField name="reason" label="Reason" options={ADMIN_DRY_RUN_REASON_OPTIONS} compact />
            <button className="inline-flex min-h-10 items-center justify-center self-end rounded-full bg-accent px-4 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-hover">
              Run dry-run
            </button>
          </form>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="audit-heading">
        <BandHeader
          icon={<TableProperties size={18} aria-hidden="true" />}
          titleId="audit-heading"
          title="Audit drill"
          detail="Reverse-chronological proof layer with filters, actor context, structured metadata, and privileged reveal only when necessary."
          meta={`Showing ${filteredAuditRows.length} of ${auditRows.length}`}
        />
        {error && data ? (
          <BandStaleNotice message={error} onRetry={() => void refreshHealth()} />
        ) : null}
        {loading && !data ? (
          <SkeletonBand rows={4} label="Loading audit rows" />
        ) : error && !data ? (
          <BandError message={error} onRetry={() => void refreshHealth()} />
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-border bg-white shadow-[var(--shadow-medium)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-raised px-5 py-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary">
                <Filter size={14} aria-hidden="true" />
                Event class
                <select
                  value={auditFilter}
                  onChange={(event) => setAuditFilter(event.target.value)}
                  className="h-9 rounded-full border border-border bg-white px-3 text-xs font-semibold text-text-primary outline-none focus:border-text-primary"
                >
                  <option value="all">All events</option>
                  {auditEventClasses.map((eventClass) => (
                    <option key={eventClass} value={eventClass}>
                      {labelFromCode(eventClass)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs font-semibold text-text-secondary">
                {filteredAuditRows.length} visible - {auditRows.length} total
              </span>
            </div>
            {filteredAuditRows.length === 0 ? (
              <EmptyState
                title="No audit rows match this filter"
                detail="Change the event class filter or refresh the dashboard."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-surface-raised text-xs font-semibold text-text-secondary">
                    <tr>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredAuditRows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${auditBadgeClasses(row.eventClass)}`}>
                            {labelFromCode(row.eventClass)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          <span className="font-semibold text-text-primary">{row.actorType}</span>
                          {row.actorId ? <span className="block text-xs">{row.actorId}</span> : null}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          <span className="font-semibold text-text-primary">{row.subjectType}</span>
                          <span className="block break-all text-xs">{row.subjectId}</span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {labelFromCode(row.reasonCode)}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {shortDate(row.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <AuditDetails
                            row={row}
                            revealed={revealed[row.id]}
                            revealReason={revealReason(row)}
                            onRevealReasonChange={(value) =>
                              setRevealReasons((prev) => ({ ...prev, [row.id]: value }))
                            }
                            onReveal={() => void reveal(row)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="suppression-heading">
        <BandHeader
          titleId="suppression-heading"
          title="Suppression rows"
          detail="Suppression is durable state. Keep it legible without turning it into the primary surface."
          meta={`${data?.suppressionRows.length ?? 0} rows`}
        />
        {(data?.suppressionRows ?? []).length === 0 ? (
          <EmptyState
            title="No suppression rows in the latest window"
            detail="Suppression state is quiet right now. Actionable items will still appear in the operator inbox."
          />
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-border bg-white shadow-[var(--shadow-medium)]">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface-raised text-xs font-semibold text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data!.suppressionRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-semibold text-text-primary">{row.identifierKind}</td>
                    <td className="px-4 py-3 text-text-secondary">{row.scope}</td>
                    <td className="px-4 py-3 text-text-secondary">{labelFromCode(row.reason)}</td>
                    <td className="px-4 py-3 text-text-secondary">{row.source}</td>
                    <td className="px-4 py-3 text-text-secondary">{shortDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="recent-actions-heading">
        <BandHeader
          titleId="recent-actions-heading"
          title="Recent actions"
          detail="Session-local feedback. Durable proof belongs in the audit drill above."
          meta={`${log.length} entries`}
        />
        {log.length === 0 ? (
          <p className="rounded-[22px] bg-surface-raised p-4 text-sm text-text-secondary shadow-[var(--shadow-subtle)]">
            No actions in this session yet.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {log.map((entry) => (
              <li
                key={entry.id}
                className={`rounded-[18px] px-4 py-3 shadow-[var(--shadow-subtle)] ${
                  entry.ok ? "bg-surface-raised text-text-secondary" : "bg-negative/10 text-negative"
                }`}
              >
                <span className="font-semibold">{shortDate(entry.at)}</span> - {entry.detail}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BandHeader({
  title,
  titleId,
  detail,
  eyebrow,
  meta,
  icon,
}: {
  title: string;
  titleId?: string;
  detail?: string;
  eyebrow?: string;
  meta?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-normal text-vivid-deep">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          {icon ? <span className="text-vivid-deep">{icon}</span> : null}
          <h2 id={titleId} className="text-xl font-semibold tracking-normal text-text-primary">
            {title}
          </h2>
        </div>
        {detail ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{detail}</p>
        ) : null}
      </div>
      {meta ? (
        <span className="inline-flex min-h-8 items-center rounded-full bg-surface-raised px-3 text-xs font-semibold text-text-secondary">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

function SkeletonBand({ rows, label }: { rows: number; label: string }) {
  return (
    <div className="rounded-[28px] border border-border bg-white p-5 shadow-[var(--shadow-medium)]">
      <p className="text-sm font-semibold text-text-secondary">{label}</p>
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-2xl bg-surface-raised" />
        ))}
      </div>
    </div>
  );
}

function BandError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[28px] border border-negative/25 bg-negative/5 p-5 text-sm text-negative shadow-[var(--shadow-subtle)]">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldAlert size={18} aria-hidden="true" />
        Could not load this band
      </div>
      <p className="mt-2 leading-6">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full border border-negative/30 bg-white px-4 text-sm font-semibold text-negative transition-colors hover:bg-negative/5"
      >
        Retry
      </button>
    </div>
  );
}

function BandStaleNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-caution/20 bg-caution/5 px-4 py-3 text-sm text-caution">
      <span className="inline-flex items-center gap-2 font-semibold">
        <ShieldAlert size={16} aria-hidden="true" />
        Showing last loaded data - {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-9 items-center rounded-full border border-caution/30 bg-white px-3 text-xs font-semibold text-caution transition-colors hover:bg-caution/10"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-border bg-white p-5 text-sm shadow-[var(--shadow-subtle)]">
      <p className="font-semibold text-text-primary">{title}</p>
      <p className="mt-2 leading-6 text-text-secondary">{detail}</p>
    </div>
  );
}

function InlineFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-normal text-text-muted">{label}</p>
      <p className="mt-1 break-words text-text-secondary">{value}</p>
    </div>
  );
}

function AuditDetails({
  row,
  revealed,
  revealReason,
  onRevealReasonChange,
  onReveal,
}: {
  row: AdminAuditRow;
  revealed: RevealedAdminRawText | undefined;
  revealReason: string;
  onRevealReasonChange: (value: string) => void;
  onReveal: () => void;
}) {
  const entries = metadataEntries(row.metadata);
  return (
    <details className="group min-w-[280px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-raised">
        Inspect
        <ChevronDown
          size={14}
          className="transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 rounded-[22px] bg-surface-raised p-4 shadow-[var(--shadow-subtle)]">
        <div className="grid gap-3 text-xs text-text-secondary">
          <InlineFact label="Event ID" value={row.id} />
          {entries.length === 0 ? (
            <p>No metadata recorded for this event.</p>
          ) : (
            entries.map((entry) => (
              <InlineFact key={entry.key} label={entry.label} value={entry.value} />
            ))
          )}
        </div>
        {row.revealable ? (
          <div className="mt-4 border-t border-border pt-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-vivid-subtle px-3 py-1 text-xs font-semibold text-vivid-deep">
              <LockKeyhole size={14} aria-hidden="true" />
              Privileged reveal
            </div>
            <label className="mt-3 block text-xs font-semibold text-text-secondary">
              Reveal reason
              <select
                className="mt-2 h-10 w-full rounded-full border border-vivid-subtle-border bg-white px-3 text-sm font-medium text-text-primary outline-none focus:border-vivid-deep"
                value={revealReason}
                onChange={(event) => onRevealReasonChange(event.target.value)}
              >
                {ADMIN_REVEAL_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onReveal}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-hover"
            >
              <Eye size={16} aria-hidden="true" />
              Reveal raw text (audited)
            </button>
            {revealed ? (
              <div className="mt-4 border-t border-border pt-4 text-sm text-text-primary">
                <p className="font-semibold">{revealed.annotation}</p>
                <dl className="mt-3 grid gap-2 text-xs text-text-secondary sm:grid-cols-2">
                  <InlineFact label="Revealed by" value={revealed.revealedBy} />
                  <InlineFact label="Revealed at" value={shortDate(revealed.revealedAt)} />
                  <InlineFact label="Field" value={revealed.field} />
                  <InlineFact label="Source event" value={revealed.sourceEventId} />
                </dl>
                <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-white p-3 shadow-[var(--shadow-subtle)]">
                  {revealed.rawText}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function Field({
  name,
  label,
  textarea,
  optional,
  compact,
}: {
  name: string;
  label: string;
  textarea?: boolean;
  optional?: boolean;
  compact?: boolean;
}) {
  const className =
    "mt-2 w-full border border-border bg-white px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-text-primary";
  return (
    <label className={`${compact ? "mt-0" : "mt-3"} block text-xs font-semibold text-text-secondary`}>
      {label}
      {optional ? " (optional)" : ""}
      {textarea ? (
        <textarea name={name} rows={2} className={`${className} rounded-2xl`} />
      ) : (
        <input name={name} required={!optional} className={`${className} h-10 rounded-full`} />
      )}
    </label>
  );
}

function SelectField({
  name,
  label,
  options,
  compact,
  disabled,
}: {
  name: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={`${compact ? "mt-0" : "mt-3"} block text-xs font-semibold text-text-secondary`}>
      {label}
      <select
        name={name}
        defaultValue={options[0]?.value}
        disabled={disabled}
        className="mt-2 h-10 w-full rounded-full border border-border bg-white px-3 text-sm font-medium text-text-primary outline-none transition-colors focus:border-text-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
