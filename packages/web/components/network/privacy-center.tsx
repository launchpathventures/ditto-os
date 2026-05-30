"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArchiveX,
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  CircleDashed,
  Database,
  Download,
  EyeOff,
  FileCheck2,
  Fingerprint,
  ListChecks,
  LockKeyhole,
  Pause,
  Pencil,
  Play,
  Save,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

import type {
  ActionBlock,
  InteractiveTableBlock,
  KnowledgeCitationBlock,
  MetricBlock,
  RecordBlock,
  StatusCardBlock,
} from "@/lib/engine";
import { ActionBlockComponent } from "@/components/blocks/action-block";
import { InteractiveTableBlockComponent } from "@/components/blocks/interactive-table-block";
import { KnowledgeCitationBlockComponent } from "@/components/blocks/knowledge-citation-block";
import { MetricBlockComponent } from "@/components/blocks/metric-block";
import { RecordBlockComponent } from "@/components/blocks/record-block";
import { StatusCardBlockComponent } from "@/components/blocks/status-card-block";
import { NetworkProfileCardRenderer } from "@/app/network/chat/network-profile-card-renderer";
import { cn } from "@/lib/utils";

import {
  PRIVACY_CENTER_SECTIONS,
  PRIVACY_SECTION_STATE_COPY,
  type PrivacyBlockListEntry,
  type PrivacyCenterData,
  type PrivacyClaim,
  type PrivacyClaimVisibility,
  type PrivacyDiscoveryExit,
  type PrivacyIntroduction,
  type PrivacyRequest,
  type PrivacySectionKey,
  type PrivacySectionState,
  type PrivacySource,
  type PrivacyWatch,
  sanitizePrivacyProfileCard,
  sealedPrivacyClaimCount,
  visiblePrivacyClaims,
} from "./privacy-center-data";

type SectionStateMap = Partial<Record<PrivacySectionKey, PrivacySectionState>>;

interface PrivacyCenterProps {
  data: PrivacyCenterData;
  sectionStates?: SectionStateMap;
}

type PrivacyChallengeKind = "export" | "delete";
type DiscoveryExitAction = PrivacyDiscoveryExit["id"];

const VISIBILITY_OPTIONS: Array<{
  value: PrivacyClaimVisibility;
  label: string;
  consequence: string;
}> = [
  {
    value: "public",
    label: "Public",
    consequence: "Visible on your public profile and share cards.",
  },
  {
    value: "on-request",
    label: "On-request",
    consequence: "Shown only when someone asks and you approve.",
  },
  {
    value: "private",
    label: "Private",
    consequence: "Used for your own calibration, not shown to visitors.",
  },
  {
    value: "hidden",
    label: "Hidden",
    consequence: "Not shown and not used for future profile copy.",
  },
];

const SECTION_DESCRIPTIONS: Record<PrivacySectionKey, string> = {
  mirror: "A quick read on what Ditto can surface, what needs approval, and what is sealed.",
  sources: "Every source carries provenance. Removing one means Ditto stops using it for future inference.",
  claims: "Only public and approved on-request claims render here. Private, hidden, and unapproved claims stay sealed.",
  profile: "Pause is reversible and does not delete private signal. Delete is destructive and identity gated.",
  requests: "Pause, resume, or close active search work without erasing the underlying signal.",
  introductions: "Read-only history. You see refusal reason codes, never sealed rule text.",
  blocked: "Owner-visible filters are shown as entries and reason codes, not anti-persona prose.",
  data: "Export is transient and identity gated. Delete creates a tombstone and a 410 direct URL.",
};

const STATE_BADGE_CLASS: Record<PrivacySectionState, string> = {
  loading: "border-border bg-surface-raised text-text-muted",
  empty: "border-border bg-surface-raised text-text-muted",
  error: "border-negative/20 bg-negative/10 text-negative",
  partial: "border-vivid-subtle-border bg-vivid-subtle text-vivid-deep",
  success: "border-border bg-white text-text-secondary",
};

const STATE_DOT_CLASS: Record<PrivacySectionState, string> = {
  loading: "bg-text-muted/40",
  empty: "bg-text-muted/40",
  error: "bg-negative",
  partial: "bg-vivid",
  success: "bg-text-primary",
};

const SECTION_TONE_CLASS: Record<PrivacySectionKey, string> = {
  mirror: "border-l-vivid",
  sources: "border-l-text-primary",
  claims: "border-l-vivid",
  profile: "border-l-text-primary",
  requests: "border-l-text-primary",
  introductions: "border-l-text-primary",
  blocked: "border-l-negative",
  data: "border-l-vivid",
};

function stateLabel(state: PrivacySectionState): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function compactSubjectLabel(subjectType: PrivacyCenterData["identity"]["subjectType"]): string {
  switch (subjectType) {
    case "member-signal":
      return "Member signal";
    case "request":
      return "Request";
    case "discovery-profile":
      return "Discovery Profile";
    case "public-profile":
    default:
      return "Public profile";
  }
}

function sectionState(
  key: PrivacySectionKey,
  fallback: PrivacySectionState,
  overrides?: SectionStateMap,
): PrivacySectionState {
  return overrides?.[key] ?? fallback;
}

function sourceTable(sources: PrivacySource[]): InteractiveTableBlock {
  return {
    type: "interactive_table",
    title: "Sources used",
    summary: `${sources.length} source${sources.length === 1 ? "" : "s"}`,
    columns: [
      { key: "source", label: "Source" },
      { key: "type", label: "Type", format: "badge" },
      { key: "claims", label: "Claims" },
      { key: "status", label: "Status", format: "badge" },
    ],
    rows: sources.map((source) => ({
      id: source.id,
      cells: {
        source: source.label,
        type: source.type,
        claims: source.claimsDerived,
        status: source.status === "removed" ? "not used" : source.status,
      },
      status: source.status === "removed" ? "error" : "approved",
      actions: [
        {
          id: `source.remove.${source.id}`,
          label: "Remove from future reasoning",
          style: "secondary",
          payload: { sourceId: source.id },
        },
      ],
    })),
  };
}

function sourceCitation(source: PrivacySource): KnowledgeCitationBlock {
  return {
    type: "knowledge_citation",
    label: `From ${source.label}`,
    sources: [
      {
        name: source.label,
        type: source.type,
        excerpt:
          source.evidenceSnippet ??
          "Source retained as provenance. Raw private text is not shown here.",
        fullText: undefined,
      },
    ],
  };
}

function requestRecord(request: PrivacyRequest): RecordBlock {
  return {
    type: "record",
    title: request.title,
    subtitle: request.mode,
    status: {
      label: request.status,
      variant:
        request.status === "paused"
          ? "caution"
          : request.status === "closed"
            ? "neutral"
            : "positive",
    },
    detail: request.summary,
    fields: [
      { label: "Updated", value: request.updatedAt ?? "not recorded" },
      { label: "Contact", value: "No one is contacted without approval" },
    ],
    actions: [
      {
        id: `request.pause.${request.id}`,
        label: "Pause",
        style: "secondary",
        payload: { requestId: request.id, action: "pause" },
      },
      {
        id: `request.resume.${request.id}`,
        label: "Resume",
        style: "secondary",
        payload: { requestId: request.id, action: "resume" },
      },
      {
        id: `request.close.${request.id}`,
        label: "Close",
        style: "danger",
        payload: { requestId: request.id, action: "close" },
      },
    ],
  };
}

function watchRecord(watch: PrivacyWatch): RecordBlock {
  return {
    type: "record",
    title: watch.displayName,
    subtitle: watch.headline,
    status: {
      label: watch.status,
      variant: watch.status === "watched" ? "positive" : "neutral",
    },
    fields: [
      { label: "Request", value: watch.requestId ?? "not linked" },
      { label: "Confidence", value: watch.confidence ?? "not scored" },
      { label: "Updated", value: watch.updatedAt ?? "not recorded" },
    ],
    actions: [
      {
        id: `watch.pause.${watch.id}`,
        label: "Pause",
        style: "secondary",
        payload: { watchId: watch.id, action: "pause" },
      },
      {
        id: `watch.resume.${watch.id}`,
        label: "Resume",
        style: "secondary",
        payload: { watchId: watch.id, action: "resume" },
      },
      {
        id: `watch.close.${watch.id}`,
        label: "Close",
        style: "danger",
        payload: { watchId: watch.id, action: "close" },
      },
    ],
  };
}

function introTable(introductions: PrivacyIntroduction[]): InteractiveTableBlock {
  return {
    type: "interactive_table",
    title: "Introduction history",
    summary: `${introductions.length} event${introductions.length === 1 ? "" : "s"}`,
    columns: [
      { key: "counterpart", label: "Counterpart" },
      { key: "state", label: "State", format: "badge" },
      { key: "refusal", label: "Reason code", format: "badge" },
      { key: "date", label: "Date" },
    ],
    rows: introductions.map((intro) => ({
      id: intro.id,
      cells: {
        counterpart: intro.counterpart,
        state: intro.state,
        refusal: intro.refusalReason ?? "none",
        date: intro.date,
      },
      status: intro.state === "refused-by-greeter" ? "flagged" : "approved",
    })),
  };
}

function blockTable(blocks: PrivacyBlockListEntry[]): InteractiveTableBlock {
  return {
    type: "interactive_table",
    title: "Blocked entries",
    summary: `${blocks.length} owner-visible filter${blocks.length === 1 ? "" : "s"}`,
    columns: [
      { key: "entry", label: "Entry" },
      { key: "kind", label: "Kind", format: "badge" },
      { key: "reason", label: "Reason code", format: "badge" },
      { key: "added", label: "Added" },
    ],
    rows: blocks.map((block) => ({
      id: block.id,
      cells: {
        entry: block.value,
        kind: block.kind,
        reason: block.reasonCode ?? "user-block",
        added: block.createdAt ?? "not recorded",
      },
      status: "pending",
      actions: [
        {
          id: `block.remove.${block.id}`,
          label: "Remove",
          style: "secondary",
          payload: { blockId: block.id },
        },
      ],
    })),
  };
}

function statusBlock(data: PrivacyCenterData, visibleCount: number, sealedCount: number): StatusCardBlock {
  return {
    type: "status_card",
    entityType: "work_item",
    entityId: data.identity.subjectId,
    title: "Privacy mirror",
    status: data.partialNotice ? "partial" : "complete",
    details: {
      Public: String(visibleCount),
      "Private or hidden": String(sealedCount),
      Sources: String(data.sources.length),
    },
  };
}

function metricBlock(data: PrivacyCenterData, visibleCount: number, sealedCount: number): MetricBlock {
  const approvedOnRequest = data.claims.filter(
    (claim) =>
      claim.visibility === "on-request" &&
      (claim.approvalState === "approved" || claim.approvalState === "edited"),
  ).length;
  return {
    type: "metric",
    metrics: [
      { value: String(visibleCount), label: "visible claims", trend: "flat" },
      { value: String(approvedOnRequest), label: "on-request", trend: "flat" },
      { value: String(sealedCount), label: "sealed", trend: "flat" },
      { value: String(data.sources.length), label: "sources", trend: "flat" },
    ],
  };
}

function exportStatusBlock(exportState: string, data: PrivacyCenterData): StatusCardBlock {
  return {
    type: "status_card",
    entityType: "work_item",
    entityId: data.exportSubjectId,
    title: "Privacy export",
    status: exportState,
    details: {
      Scope: `${data.exportSubjectType} data`,
      Storage: "Transient response only",
      "Persisted file": "Not used",
    },
  };
}

function exportActionBlock(disabled: boolean, label = "Verify and export"): ActionBlock {
  return {
    type: "actions",
    actions: [
      {
        id: "privacy.export",
        label: disabled ? "Export queued" : label,
        style: "primary",
      },
    ],
  };
}

function SectionShell({
  sectionKey,
  state,
  index,
  children,
}: {
  sectionKey: PrivacySectionKey;
  state: PrivacySectionState;
  index: number;
  children: React.ReactNode;
}) {
  const section = PRIVACY_CENTER_SECTIONS.find((item) => item.key === sectionKey);
  const label = section?.label ?? sectionKey;
  const copy = PRIVACY_SECTION_STATE_COPY[sectionKey][state];
  return (
    <section
      id={`privacy-${sectionKey}`}
      data-testid={`privacy-section-${sectionKey}`}
      data-section-state={state}
      className={cn(
        "scroll-mt-8 border-t border-border/80 py-10 first:border-t-0",
        "lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10",
      )}
    >
      <header className="max-w-2xl lg:max-w-none">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tabular-nums text-text-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
              STATE_BADGE_CLASS[state],
            )}
          >
            {stateLabel(state)}
          </span>
        </div>
        <h2 className="mt-4 text-[28px] font-semibold leading-[1.04] text-text-primary sm:text-3xl lg:text-2xl">
          {label}
        </h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          {SECTION_DESCRIPTIONS[sectionKey]}
        </p>
        {state === "empty" ? null : (
          <p
            className={cn(
              "mt-5 border-l-2 bg-surface-raised px-4 py-3 text-sm leading-5 text-text-secondary shadow-[var(--shadow-subtle)]",
              SECTION_TONE_CLASS[sectionKey],
            )}
          >
            {copy}
          </p>
        )}
      </header>
      {state === "loading" ? (
        <div className="mt-6 grid gap-3 lg:mt-0" data-testid={`privacy-${sectionKey}-loading`}>
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-raised" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-surface-raised" />
          <div className="h-20 animate-pulse rounded-2xl bg-surface-raised" />
        </div>
      ) : state === "error" ? (
        <div className="mt-6 rounded-2xl border border-negative/20 bg-negative/5 p-4 text-sm text-negative lg:mt-0">
          {copy}
        </div>
      ) : (
        <div className="mt-6 min-w-0 lg:mt-0">
          {children}
        </div>
      )}
    </section>
  );
}

function ConsequenceLine({ visibility }: { visibility: PrivacyClaimVisibility }) {
  const option = VISIBILITY_OPTIONS.find((item) => item.value === visibility);
  return (
    <p className="mt-2 text-xs leading-5 text-text-muted">
      {option?.consequence ?? "Visibility consequence is unavailable."}
    </p>
  );
}

function PrivacyRail({
  data,
  visibleCount,
  sealedCount,
  sectionStates,
}: {
  data: PrivacyCenterData;
  visibleCount: number;
  sealedCount: number;
  sectionStates: Record<PrivacySectionKey, PrivacySectionState>;
}) {
  const proofItems = [
    {
      icon: data.identity.verified ? ShieldCheck : LockKeyhole,
      label: "Identity",
      value: data.identity.verified ? "Verified" : "Locked",
    },
    {
      icon: ListChecks,
      label: "Visible",
      value: `${visibleCount} claim${visibleCount === 1 ? "" : "s"}`,
    },
    {
      icon: EyeOff,
      label: "Sealed",
      value: `${sealedCount} item${sealedCount === 1 ? "" : "s"}`,
    },
    {
      icon: Database,
      label: "Sources",
      value: `${data.sources.length}`,
    },
  ];

  return (
    <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
      <div className="min-w-0 rounded-[24px] border border-border bg-white p-4 shadow-[var(--shadow-medium)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Fingerprint className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {data.identity.viewerLabel}
            </p>
            <p className="mt-1 text-xs leading-4 text-text-muted">
              {compactSubjectLabel(data.identity.subjectType)}
              {data.identity.context ? ` · ${data.identity.context} lane` : ""}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {proofItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl bg-surface-raised p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                </div>
                <p className="mt-2 text-sm font-semibold text-text-primary">
                  {item.value}
                </p>
              </div>
            );
          })}
        </div>

        {data.identity.emailMasked ? (
          <p className="mt-4 rounded-2xl bg-vivid-subtle px-3 py-2 text-xs font-medium leading-5 text-vivid-deep">
            Verification challenge: {data.identity.emailMasked}
          </p>
        ) : null}
      </div>

      <nav
        aria-label="Privacy sections"
        className="mt-4 flex max-w-full gap-1 overflow-x-auto rounded-[24px] border border-border bg-white p-2 shadow-[var(--shadow-subtle)] lg:block lg:overflow-visible"
      >
        {PRIVACY_CENTER_SECTIONS.map((section, index) => {
          const state = sectionStates[section.key];
          return (
            <a
              key={section.key}
              href={`#privacy-${section.key}`}
              aria-label={`${section.label}: ${stateLabel(state)}`}
              className="group flex min-h-10 flex-none items-center justify-between gap-3 rounded-2xl px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary lg:flex lg:w-full"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-[11px] tabular-nums text-text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    STATE_DOT_CLASS[state],
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{section.label}</span>
              </span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted lg:inline">
                {stateLabel(state)}
              </span>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 lg:hidden" aria-hidden="true" />
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

export function PrivacyCenter({ data, sectionStates }: PrivacyCenterProps) {
  const sanitizedCard = sanitizePrivacyProfileCard(data.profileCard);
  const [sources, setSources] = React.useState(data.sources);
  const [claims, setClaims] = React.useState(data.claims);
  const [profilePaused, setProfilePaused] = React.useState(data.profilePaused);
  const [requests, setRequests] = React.useState(data.requests);
  const [watches, setWatches] = React.useState(data.watches);
  const [blocks, setBlocks] = React.useState(data.blocks);
  const [exportState, setExportState] = React.useState<"ready" | "queued" | "complete" | "failed">("ready");
  const [exportSummary, setExportSummary] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteStep, setDeleteStep] = React.useState<"consequences" | "verify" | "final" | "success">("consequences");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [challengeMaskedEmail, setChallengeMaskedEmail] = React.useState<string | null>(
    data.identity.emailMasked ?? null,
  );
  const [statusMessage, setStatusMessage] = React.useState<string | null>(data.partialNotice ?? null);
  const [discoveryAction, setDiscoveryAction] = React.useState<DiscoveryExitAction | null>(null);
  const [profileVisibilitySaving, setProfileVisibilitySaving] = React.useState(false);
  const [blockValue, setBlockValue] = React.useState("");
  const [blockSaving, setBlockSaving] = React.useState(false);
  const privacySessionIdRef = React.useRef<string | null>(data.identity.sessionId ?? null);

  const visibleClaims = React.useMemo(() => visiblePrivacyClaims(claims), [claims]);
  const sealedCount = React.useMemo(() => sealedPrivacyClaimCount(claims), [claims]);

  function currentPrivacySessionId(): string {
    if (!privacySessionIdRef.current) {
      privacySessionIdRef.current =
        globalThis.crypto?.randomUUID?.() ?? `privacy-${Date.now().toString(36)}`;
    }
    return privacySessionIdRef.current;
  }

  async function initiatePrivacyChallenge(kind: PrivacyChallengeKind): Promise<boolean> {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setStatusMessage("Enter your email first so Ditto can send a verification code.");
      return false;
    }

    const endpoint =
      kind === "export"
        ? "/api/v1/network/privacy/export"
        : "/api/v1/network/privacy/delete";
    const subjectType = kind === "export" ? data.exportSubjectType : data.deleteSubjectType;
    const subjectId = kind === "export" ? data.exportSubjectId : data.deleteSubjectId;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "initiate-challenge",
          subjectType,
          subjectId,
          sessionId: currentPrivacySessionId(),
          email: cleanEmail,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { maskedEmail?: string };
      setChallengeMaskedEmail(payload.maskedEmail ?? data.identity.emailMasked ?? null);
      setStatusMessage(
        `Verification code sent to ${payload.maskedEmail ?? data.identity.emailMasked ?? "the recorded email"}.`,
      );
      return true;
    } catch {
      setStatusMessage("Couldn't send a verification code. Nothing was changed.");
      return false;
    }
  }

  function handleSourceAction(actionId: string) {
    if (!actionId.startsWith("source.remove.")) return;
    const sourceId = actionId.replace("source.remove.", "");
    const previous = sources;
    setSources((current) =>
      current.map((source) =>
        source.id === sourceId ? { ...source, status: "removed" } : source,
      ),
    );
    if (!data.memberSignalId || !data.identity.sessionId) {
      setSources(previous);
      setStatusMessage("Source removal requires a verified member signal session.");
      return;
    }
    fetch("/api/v1/network/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "remove_source",
        sessionId: data.identity.sessionId,
        context: data.identity.context,
        memberSignalId: data.memberSignalId,
        sourceId,
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setStatusMessage(
          "Source removed from future reasoning. Existing provenance stays visible so past decisions remain explainable.",
        );
      })
      .catch(() => {
        setSources(previous);
        setStatusMessage("Couldn't remove that source. Nothing was changed.");
      });
  }

  async function updateClaim(
    claimId: string,
    updates: Partial<Pick<PrivacyClaim, "visibility" | "approvalState" | "claimText">>,
    claimAction?: "edit" | "hide" | "delete" | "visibility",
  ) {
    setClaims((current) =>
      current.map((claim) =>
        claim.id === claimId ? { ...claim, ...updates } : claim,
      ),
    );

    if (!data.memberSignalId || !data.identity.sessionId) return;
    const action = claimAction
      ?? (updates.approvalState === "hidden"
        ? "hide"
        : typeof updates.claimText === "string"
          ? "edit"
          : "visibility");
    try {
      await fetch("/api/v1/network/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "update_claim",
          sessionId: data.identity.sessionId,
          context: data.identity.context,
          userId: data.identity.userId,
          memberSignalId: data.memberSignalId,
          claimId,
          claimAction: action,
          visibility: updates.visibility,
          claimText: updates.claimText ?? null,
        }),
      });
    } catch {
      setStatusMessage("Claim update could not be confirmed. Nothing destructive was attempted.");
    }
  }

  async function updateRequest(requestId: string, action: "pause" | "resume" | "close") {
    setRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? { ...request, status: action === "resume" ? "active" : action === "pause" ? "paused" : "closed" }
          : request,
      ),
    );
    if (!data.identity.sessionId) return;
    try {
      await fetch("/api/v1/network/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: data.identity.sessionId,
          requestId,
          action,
        }),
      });
    } catch {
      setStatusMessage("Request update could not be confirmed. Nothing destructive was attempted.");
    }
  }

  function handleRequestAction(actionId: string, payload?: Record<string, unknown>) {
    if (typeof payload?.requestId === "string" && typeof payload.action === "string") {
      void updateRequest(payload.requestId, payload.action as "pause" | "resume" | "close");
    }
  }

  function handleWatchAction(actionId: string, payload?: Record<string, unknown>) {
    if (typeof payload?.watchId !== "string" || typeof payload.action !== "string") return;
    const action = payload.action as "pause" | "resume" | "close";
    const nextStatus =
      action === "resume"
        ? "watched"
        : action === "pause"
          ? "paused"
          : "closed";
    const previous = watches;
    setWatches((current) =>
      current.map((watch) =>
        watch.id === payload.watchId ? { ...watch, status: nextStatus } : watch,
      ),
    );
    if (!data.identity.sessionId) {
      setWatches(previous);
      setStatusMessage("Watch updates require a verified Network session.");
      return;
    }
    fetch("/api/v1/network/privacy/watches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        sessionId: data.identity.sessionId,
        context: data.identity.context,
        watchId: payload.watchId,
        action,
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setStatusMessage(`Background Watch ${action === "close" ? "closed" : `${nextStatus}`}.`);
      })
      .catch(() => {
        setWatches(previous);
        setStatusMessage("Couldn't update that Background Watch. Nothing was changed.");
      });
  }

  function validBlockPattern(value: string): boolean {
    return value.length <= 254 && !/[\\^$+?.()|\[\]{}]/.test(value);
  }

  async function handleBlockAction(actionId: string) {
    if (!actionId.startsWith("block.remove.")) return;
    const blockId = actionId.replace("block.remove.", "");
    const previous = blocks;
    setBlocks((current) => current.filter((block) => block.id !== blockId));
    if (!data.identity.sessionId) {
      setBlocks(previous);
      setStatusMessage("Block-list updates require a verified Network session.");
      return;
    }
    try {
      const response = await fetch("/api/v1/network/privacy/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "remove",
          sessionId: data.identity.sessionId,
          context: data.identity.context,
          blockId,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatusMessage("Private filter removed.");
    } catch {
      setBlocks(previous);
      setStatusMessage("Couldn't remove that private filter. Nothing was changed.");
    }
  }

  async function addBlockPattern() {
    const value = blockValue.trim();
    if (!value || !validBlockPattern(value)) {
      setStatusMessage("Use a pattern up to 254 characters. Only * is allowed as a wildcard.");
      return;
    }
    if (!data.identity.sessionId) {
      setStatusMessage("Block-list updates require a verified Network session.");
      return;
    }
    setBlockSaving(true);
    try {
      const response = await fetch("/api/v1/network/privacy/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "add",
          sessionId: data.identity.sessionId,
          context: data.identity.context,
          value,
          reason: "privacy-center-user-block",
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as {
        block?: {
          id: string;
          kind: string;
          blockedRequesterIdentifier: string;
          reason?: string | null;
          createdAt?: string | Date | null;
        };
      };
      if (payload.block) {
        setBlocks((current) => [
          {
            id: payload.block!.id,
            kind: payload.block!.kind,
            value: payload.block!.blockedRequesterIdentifier,
            reasonCode: payload.block!.reason ?? "user-block",
            createdAt:
              typeof payload.block!.createdAt === "string"
                ? payload.block!.createdAt.slice(0, 10)
                : "not recorded",
          },
          ...current.filter((block) => block.id !== payload.block!.id),
        ]);
      }
      setBlockValue("");
      setStatusMessage("Private filter added.");
    } catch {
      setStatusMessage("Couldn't add that private filter. Nothing was changed.");
    } finally {
      setBlockSaving(false);
    }
  }

  async function handleDiscoveryExit(action: DiscoveryExitAction) {
    const token = data.discoveryProfile?.claimToken?.trim();
    if (!token) {
      setStatusMessage("This Discovery Profile action requires a verified claim token.");
      return;
    }

    if (action === "claim") {
      window.location.assign(`/network/claim/${encodeURIComponent(token)}`);
      return;
    }

    setDiscoveryAction(action);
    const routeAction =
      action === "delete" ? "delete" : action === "suppress" ? "suppress" : "decline";
    const reason =
      action === "suppress"
        ? "privacy-center-suppress"
        : action === "decline"
          ? "privacy-center-decline"
          : "privacy-center-delete";
    try {
      const response = await fetch(`/api/v1/network/invites/${encodeURIComponent(token)}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: routeAction,
          reason,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatusMessage(
        action === "delete"
          ? "Discovery Profile deleted. Direct profile links now return a privacy tombstone."
          : action === "suppress"
            ? "Future Discovery Profile use suppressed for this contact path."
            : "Contact declined. Ditto will not use this request to contact you.",
      );
    } catch {
      setStatusMessage("Couldn't update this Discovery Profile. Nothing was changed.");
    } finally {
      setDiscoveryAction(null);
    }
  }

  async function toggleProfileVisibility() {
    if (!data.identity.sessionId) {
      setStatusMessage("Profile visibility changes require a verified Network session.");
      return;
    }

    const nextPaused = !profilePaused;
    const previousPaused = profilePaused;
    setProfilePaused(nextPaused);
    setProfileVisibilitySaving(true);
    try {
      const body: Record<string, unknown> = {
        action: "set_visibility",
        sessionId: data.identity.sessionId,
        wantsVisibility: !nextPaused,
      };
      if (data.identity.context) body.context = data.identity.context;
      const response = await fetch("/api/v1/network/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatusMessage(
        nextPaused
          ? "Public profile paused. Private signal remains available to you."
          : "Public profile resumed.",
      );
    } catch {
      setProfilePaused(previousPaused);
      setStatusMessage("Couldn't update public profile visibility. Nothing was changed.");
    } finally {
      setProfileVisibilitySaving(false);
    }
  }

  async function handleExport() {
    if (!data.identity.verified && !code.trim()) {
      setExportState("ready");
      setExportSummary(null);
      await initiatePrivacyChallenge("export");
      return;
    }
    if (!data.identity.verified && (!email.trim() || !code.trim())) {
      setStatusMessage("Enter the email and verification code before exporting.");
      return;
    }

    setExportState("queued");
    setExportSummary(null);
    try {
      const body: Record<string, unknown> = {
        action: "verify-and-export",
        subjectType: data.exportSubjectType,
        subjectId: data.exportSubjectId,
        sessionId: currentPrivacySessionId(),
        method: data.identity.verified ? "session" : "email-challenge",
      };
      if (data.identity.context) body.context = data.identity.context;
      if (!data.identity.verified) {
        body.email = email;
        body.code = code;
      }
      const response = await fetch("/api/v1/network/privacy/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as {
        summary?: { snapshotAt?: string; skippedTombstoned?: number };
      };
      setExportState("complete");
      setExportSummary(
        `Snapshot ${payload.summary?.snapshotAt ?? "created"}; ${payload.summary?.skippedTombstoned ?? 0} tombstoned rows skipped.`,
      );
    } catch {
      setExportState("failed");
      setExportSummary("Export failed - your data is unchanged.");
    }
  }

  async function handleDelete() {
    if (!data.identity.verified && !code.trim()) {
      await initiatePrivacyChallenge("delete");
      setDeleteStep("verify");
      return;
    }
    if (!data.identity.verified && (!email.trim() || !code.trim())) {
      setStatusMessage("Enter the email and verification code before deleting.");
      setDeleteStep("verify");
      return;
    }

    setDeleteStep("final");
    try {
      const body: Record<string, unknown> = {
        action: "verify-and-delete",
        subjectType: data.deleteSubjectType,
        subjectId: data.deleteSubjectId,
        sessionId: currentPrivacySessionId(),
        method: data.identity.verified ? "session" : "email-challenge",
        reason: "user-requested-privacy-delete",
      };
      if (data.identity.context) body.context = data.identity.context;
      if (!data.identity.verified) {
        body.email = email;
        body.code = code;
      }
      const response = await fetch("/api/v1/network/privacy/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok && response.status !== 410) throw new Error(`HTTP ${response.status}`);
      setDeleteStep("success");
    } catch {
      setStatusMessage("Couldn't delete - nothing was changed. Try again.");
      setDeleteStep("verify");
    }
  }

  const mirrorState = sectionState(
    "mirror",
    data.partialNotice ? "partial" : "success",
    sectionStates,
  );
  const sourceState = sectionState(
    "sources",
    sources.length === 0 ? "empty" : data.partialNotice ? "partial" : "success",
    sectionStates,
  );
  const claimsState = sectionState(
    "claims",
    visibleClaims.length === 0 ? "empty" : data.partialNotice ? "partial" : "success",
    sectionStates,
  );
  const profileState = sectionState(
    "profile",
    sanitizedCard ? "success" : "empty",
    sectionStates,
  );
  const requestState = sectionState(
    "requests",
    requests.length === 0 && watches.length === 0 ? "empty" : data.partialNotice ? "partial" : "success",
    sectionStates,
  );
  const introState = sectionState(
    "introductions",
    data.introductions.length === 0 ? "empty" : data.partialNotice ? "partial" : "success",
    sectionStates,
  );
  const blockState = sectionState(
    "blocked",
    blocks.length === 0 ? "empty" : data.partialNotice ? "partial" : "success",
    sectionStates,
  );
  const dataState = sectionState("data", "success", sectionStates);
  const resolvedSectionStates: Record<PrivacySectionKey, PrivacySectionState> = {
    mirror: mirrorState,
    sources: sourceState,
    claims: claimsState,
    profile: profileState,
    requests: requestState,
    introductions: introState,
    blocked: blockState,
    data: dataState,
  };

  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-text-primary sm:px-8 lg:py-10">
      <div className="mx-auto max-w-[1280px]">
        <nav className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/network/chat"
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary shadow-[var(--shadow-subtle)] transition-colors hover:bg-surface-raised"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Network chat
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-[var(--shadow-subtle)]">
            <ShieldCheck className="h-3.5 w-3.5 text-vivid" aria-hidden="true" />
            Owner-visible privacy ledger
          </div>
        </nav>

        <header className="border-b border-border pb-9">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-vivid">
            Privacy Center
          </p>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,0.45fr)] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-[40px] font-semibold leading-[1.02] text-text-primary sm:text-[58px] lg:text-[64px]">
                Control what Ditto knows about you.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-text-secondary">
                A provenance-first ledger for sources, claims, requests,
                watches, introductions, filters, export, and deletion. Public
                material stays legible; private material stays sealed.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-[24px] bg-white p-2 shadow-[var(--shadow-medium)]">
              <div className="rounded-2xl bg-surface-raised p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Public
                </p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">
                  {visibleClaims.length}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-raised p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Sealed
                </p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">
                  {sealedCount}
                </p>
              </div>
              <div className="rounded-2xl bg-vivid-subtle p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-vivid-deep">
                  Rights
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-vivid-deep">
                  Export · Delete
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <PrivacyRail
            data={data}
            visibleCount={visibleClaims.length}
            sealedCount={sealedCount}
            sectionStates={resolvedSectionStates}
          />

          <div className="min-w-0">
            {statusMessage ? (
              <div className="mb-6 rounded-2xl border border-vivid-subtle-border bg-vivid-subtle px-4 py-3 text-sm font-medium leading-6 text-vivid-deep shadow-[var(--shadow-subtle)]">
                {statusMessage}
              </div>
            ) : null}

        {data.discoveryProfile?.enabled ? (
          <section
            className="mb-10 overflow-hidden rounded-[24px] border border-vivid-subtle-border bg-white shadow-[var(--shadow-medium)]"
            data-testid="discovery-profile-self-service"
          >
            <div className="border-b border-vivid-subtle-border bg-vivid-subtle px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-vivid-deep">
                  Original to Ditto
                </p>
                <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-vivid-deep shadow-[var(--shadow-subtle)]">
                  Provenance first
                </span>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-semibold leading-tight text-text-primary">
                  {data.discoveryProfile.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-text-secondary">
                  {data.discoveryProfile.summary}
                </p>
              </div>
              {sources.length > 0 ? (
                <div className="mt-5 grid gap-2">
                  {sources.map((source) => (
                    <KnowledgeCitationBlockComponent
                      key={source.id}
                      block={sourceCitation(source)}
                    />
                  ))}
                </div>
              ) : null}
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                {data.discoveryProfile.exits.map((exit) => (
                  <button
                    key={exit.id}
                    type="button"
                    data-testid="discovery-exit"
                    data-weight="equal"
                    data-action={exit.id}
                    disabled={discoveryAction !== null}
                    onClick={() => void handleDiscoveryExit(exit.id)}
                    className="group min-h-32 rounded-2xl border border-border bg-surface-raised p-4 text-left shadow-[var(--shadow-subtle)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--shadow-medium)] disabled:translate-y-0 disabled:opacity-60"
                  >
                    <span className="flex items-start justify-between gap-3 text-sm font-semibold text-text-primary">
                      {discoveryAction === exit.id ? "Updating..." : exit.label}
                      <ChevronRight className="mt-0.5 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-text-secondary">
                      {exit.copy}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <div className="px-1 py-2 sm:px-2">
          <SectionShell sectionKey="mirror" state={mirrorState} index={0}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(360px,1fr)]">
              <StatusCardBlockComponent block={statusBlock(data, visibleClaims.length, sealedCount)} />
              <MetricBlockComponent block={metricBlock(data, visibleClaims.length, sealedCount)} />
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface-raised px-4 py-2 text-sm font-semibold text-text-secondary">
              <EyeOff className="h-4 w-4" aria-hidden="true" />
              {sealedCount} private, hidden, or unapproved claim{sealedCount === 1 ? "" : "s"} sealed before render.
            </div>
          </SectionShell>

          <SectionShell sectionKey="sources" state={sourceState} index={1}>
            {sources.length === 0 ? (
              <EmptyPanel icon={FileCheck2} label="No sources loaded yet." />
            ) : (
              <>
                <InteractiveTableBlockComponent
                  block={sourceTable(sources)}
                  onAction={handleSourceAction}
                />
                <div className="mt-4 grid gap-2">
                  {sources.slice(0, 4).map((source) => (
                    <KnowledgeCitationBlockComponent
                      key={source.id}
                      block={sourceCitation(source)}
                    />
                  ))}
                </div>
              </>
            )}
          </SectionShell>

          <SectionShell sectionKey="claims" state={claimsState} index={2}>
            {visibleClaims.length === 0 ? (
              <EmptyPanel icon={EyeOff} label="No claims passed the render filter." />
            ) : (
              <div className="grid gap-4">
                {visibleClaims.map((claim) => (
                  <ClaimRow
                    key={claim.id}
                    claim={claim}
                    onVisibilityChange={(visibility) => void updateClaim(claim.id, { visibility })}
                    onEdit={(claimText) => void updateClaim(claim.id, { claimText }, "edit")}
                    onHide={() => void updateClaim(claim.id, { visibility: "hidden", approvalState: "hidden" })}
                    onDelete={() => void updateClaim(claim.id, { visibility: "hidden", approvalState: "rejected" }, "delete")}
                  />
                ))}
              </div>
            )}
          </SectionShell>

          <SectionShell sectionKey="profile" state={profileState} index={3}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                {sanitizedCard ? (
                  <div data-testid="privacy-public-profile-preview">
                    <NetworkProfileCardRenderer card={sanitizedCard} preview />
                  </div>
                ) : (
                  <EmptyPanel icon={CircleDashed} label="No public profile exists." />
                )}
              </div>
              <div className="rounded-[20px] border border-border bg-white p-4 shadow-[var(--shadow-subtle)]">
                <p className="text-sm font-semibold text-text-primary">
                  Public visibility
                </p>
                <p className="mt-2 text-sm leading-5 text-text-secondary">
                  Pause hides the public projection without deleting private signal.
                </p>
                <button
                  type="button"
                  data-action-kind="reversible"
                  onClick={() => void toggleProfileVisibility()}
                  disabled={profileVisibilitySaving}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary shadow-[var(--shadow-subtle)] transition-colors hover:bg-surface-subtle disabled:opacity-60"
                >
                  {profilePaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
                  {profileVisibilitySaving
                    ? "Saving..."
                    : profilePaused
                      ? "Resume public profile"
                      : "Pause public profile"}
                </button>
                <button
                  type="button"
                  data-action-kind="destructive"
                  onClick={() => {
                    setDeleteOpen(true);
                    setDeleteStep("consequences");
                  }}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-negative/30 bg-white px-4 text-sm font-semibold text-negative shadow-[var(--shadow-subtle)] transition-colors hover:bg-negative/5"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete public projection
                </button>
              </div>
            </div>
          </SectionShell>

          <SectionShell sectionKey="requests" state={requestState} index={4}>
            {requests.length === 0 && watches.length === 0 ? (
              <EmptyPanel icon={ArchiveX} label="No active request or watch." />
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Active Requests</h3>
                  <div className="mt-3 rounded-[20px] border border-border bg-white p-4 shadow-[var(--shadow-subtle)]">
                    {requests.map((request) => (
                      <RecordBlockComponent
                        key={request.id}
                        block={requestRecord(request)}
                        onAction={handleRequestAction}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Background Watches</h3>
                  <div className="mt-3 rounded-[20px] border border-border bg-white p-4 shadow-[var(--shadow-subtle)]">
                    {watches.map((watch) => (
                      <RecordBlockComponent
                        key={watch.id}
                        block={watchRecord(watch)}
                        onAction={handleWatchAction}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </SectionShell>

          <SectionShell sectionKey="introductions" state={introState} index={5}>
            {data.introductions.length === 0 ? (
              <EmptyPanel icon={CheckCircle2} label="No introductions yet." />
            ) : (
              <InteractiveTableBlockComponent block={introTable(data.introductions)} />
            )}
          </SectionShell>

          <SectionShell sectionKey="blocked" state={blockState} index={6}>
            <div className="rounded-[20px] border border-border bg-white p-4 shadow-[var(--shadow-subtle)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text-primary">
                  You have {blocks.length} private filter{blocks.length === 1 ? "" : "s"} shaping who reaches you.
                </p>
                <p className="text-xs text-text-muted">
                  Pattern rules allow "*" only, up to 254 characters, with no regex metacharacters.
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={blockValue}
                  onChange={(event) => setBlockValue(event.target.value)}
                  placeholder="*@example.com"
                  className="min-h-11 flex-1 rounded-full border border-border bg-white px-4 text-sm outline-none transition-colors focus:border-text-primary"
                  aria-label="Block pattern"
                />
                <button
                  type="button"
                  onClick={() => void addBlockPattern()}
                  disabled={blockSaving}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
                >
                  {blockSaving ? "Saving..." : "Add filter"}
                </button>
              </div>
              {blocks.length > 0 ? (
                <InteractiveTableBlockComponent
                  block={blockTable(blocks)}
                  onAction={(actionId) => void handleBlockAction(actionId)}
                />
              ) : (
                <EmptyPanel icon={XCircle} label="No filters are active." />
              )}
            </div>
          </SectionShell>

          <SectionShell sectionKey="data" state={dataState} index={7}>
            <div
              className="grid gap-6 lg:grid-cols-2"
              data-export-flow="status-card-action-block"
            >
              <div className="rounded-[20px] border border-border bg-white p-4 shadow-[var(--shadow-subtle)]">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-text-primary">
                    Export your data
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-5 text-text-secondary">
                  Export includes signal, request, watch, intro, and share data
                  available to this subject. The bundle is returned transiently
                  after identity verification.
                </p>
                {!data.identity.verified ? (
                  <div className="mt-4 grid gap-2 rounded-2xl bg-surface-raised p-4 shadow-[var(--shadow-subtle)]">
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={challengeMaskedEmail ?? "email@example.com"}
                      className="min-h-11 rounded-full border border-border bg-white px-4 text-sm outline-none focus:border-text-primary"
                      aria-label="Email for export verification"
                    />
                    <input
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="Verification code"
                      className="min-h-11 rounded-full border border-border bg-white px-4 text-sm outline-none focus:border-text-primary"
                      aria-label="Export verification code"
                    />
                  </div>
                ) : null}
                <StatusCardBlockComponent block={exportStatusBlock(exportState, data)} />
                <ActionBlockComponent
                  block={exportActionBlock(
                    exportState === "queued",
                    !data.identity.verified && !challengeMaskedEmail
                      ? "Send verification code"
                      : !data.identity.verified
                        ? "Verify code and export"
                        : "Verify and export",
                  )}
                  onAction={() => void handleExport()}
                />
                {exportSummary ? (
                  <p className="mt-2 text-xs leading-5 text-text-secondary">
                    {exportSummary}
                  </p>
                ) : null}
              </div>
              <div className="rounded-[20px] border border-negative/20 bg-negative/5 p-4 shadow-[var(--shadow-subtle)]">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-negative" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-negative">
                    Delete public profile projection
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-5 text-text-secondary">
                  Deletion is recoverable for {data.deleteRecoveryDays} days,
                  then hard-purged. The tombstone is minimized to a neutral
                  non-PII stub after {data.permanentStubYears} years. Direct
                  profile URLs return HTTP 410.
                </p>
                <button
                  type="button"
                  data-action-kind="destructive"
                  onClick={() => {
                    setDeleteOpen(true);
                    setDeleteStep("consequences");
                  }}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-negative/30 bg-white px-4 text-sm font-semibold text-negative shadow-[var(--shadow-subtle)] transition-colors hover:bg-negative/5"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Start delete flow
                </button>
              </div>
            </div>
          </SectionShell>
        </div>
      </div>
      </div>
      </div>

      {deleteOpen ? (
        <DeleteDialog
          step={deleteStep}
          data={data}
          email={email}
          code={code}
          challengeMaskedEmail={challengeMaskedEmail}
          setEmail={setEmail}
          setCode={setCode}
          onClose={() => setDeleteOpen(false)}
          onNext={() => setDeleteStep(data.identity.verified ? "final" : "verify")}
          onSendCode={() => void initiatePrivacyChallenge("delete")}
          onFinal={() => void handleDelete()}
        />
      ) : null}
    </main>
  );
}

function ClaimRow({
  claim,
  onVisibilityChange,
  onEdit,
  onHide,
  onDelete,
}: {
  claim: PrivacyClaim;
  onVisibilityChange: (visibility: PrivacyClaimVisibility) => void;
  onEdit: (claimText: string) => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draftText, setDraftText] = React.useState(claim.claimText);
  const record: RecordBlock = {
    type: "record",
    title: claim.claimText,
    subtitle: claim.section,
    status: {
      label: claim.visibility,
      variant: claim.visibility === "public" ? "positive" : "info",
    },
    confidence:
      claim.confidence === "high" || claim.confidence === "medium" || claim.confidence === "low"
        ? claim.confidence
        : null,
    fields: [
      { label: "Source", value: claim.sourceLabel, provenance: claim.sourceType },
      { label: "Approval", value: claim.approvalState },
    ],
    detail: claim.evidenceSnippet,
    provenance: [claim.sourceLabel],
  };

  return (
    <article
      className="rounded-[20px] border border-border bg-white p-4 shadow-[var(--shadow-subtle)] transition-shadow hover:shadow-[var(--shadow-medium)]"
      data-testid="privacy-claim-row"
    >
      <RecordBlockComponent block={record} />
      {editing ? (
        <div className="mt-4 grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
            Claim text
          </label>
          <textarea
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            className="min-h-24 rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-6 text-text-primary outline-none transition-colors focus:border-text-primary"
            aria-label={`Edit claim for ${claim.section}`}
          />
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
            Visibility
          </label>
          <select
            value={claim.visibility}
            onChange={(event) => onVisibilityChange(event.target.value as PrivacyClaimVisibility)}
            className="mt-2 min-h-11 w-full rounded-full border border-border bg-white px-3 text-sm font-semibold text-text-primary outline-none transition-colors focus:border-text-primary"
            aria-label={`Visibility for ${claim.section}`}
          >
            {VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ConsequenceLine visibility={claim.visibility} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (editing) {
                onEdit(draftText);
                setEditing(false);
              } else {
                setEditing(true);
              }
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary shadow-[var(--shadow-subtle)] transition-colors hover:bg-surface-subtle"
          >
            {editing ? <Save className="h-4 w-4" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
            {editing ? "Save edit" : "Edit"}
          </button>
          <button
            type="button"
            onClick={onHide}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary shadow-[var(--shadow-subtle)] transition-colors hover:bg-surface-subtle"
          >
            <EyeOff className="h-4 w-4" aria-hidden="true" />
            Hide
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-negative/30 bg-white px-4 text-sm font-semibold text-negative shadow-[var(--shadow-subtle)] transition-colors hover:bg-negative/5"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete claim
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyPanel({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-border bg-white p-5 text-sm text-text-secondary shadow-[var(--shadow-subtle)]">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-text-muted">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}

function DeleteDialog({
  step,
  data,
  email,
  code,
  challengeMaskedEmail,
  setEmail,
  setCode,
  onClose,
  onNext,
  onSendCode,
  onFinal,
}: {
  step: "consequences" | "verify" | "final" | "success";
  data: PrivacyCenterData;
  email: string;
  code: string;
  challengeMaskedEmail: string | null;
  setEmail: (value: string) => void;
  setCode: (value: string) => void;
  onClose: () => void;
  onNext: () => void;
  onSendCode: () => void;
  onFinal: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-delete-title"
    >
      <div className="w-full max-w-[540px] rounded-[24px] border border-border bg-white p-6 shadow-[var(--shadow-large)]">
        {step === "success" ? (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-positive/10 text-positive">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 id="privacy-delete-title" className="mt-4 text-2xl font-semibold text-text-primary">
              Public projection deleted
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Direct profile URLs now return HTTP 410. Recovery is available for
              {` ${data.deleteRecoveryDays} `}days; after that the data is hard-purged
              and only a neutral tombstone stub remains.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h2 id="privacy-delete-title" className="text-2xl font-semibold text-text-primary">
              Delete public profile projection
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Consequences first: your public profile and direct share URLs stop
              working, the direct profile URL returns HTTP 410, and deletion is
              recoverable for {data.deleteRecoveryDays} days before hard purge.
            </p>

            {step === "verify" ? (
              <div className="mt-5 grid gap-3">
                <label className="text-sm font-semibold text-text-primary">
                  Verify this is you
                </label>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={challengeMaskedEmail ?? data.identity.emailMasked ?? "email@example.com"}
                  className="min-h-11 rounded-full border border-border px-4 text-sm outline-none transition-colors focus:border-text-primary"
                />
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Confirmation code"
                  className="min-h-11 rounded-full border border-border px-4 text-sm outline-none transition-colors focus:border-text-primary"
                />
                <button
                  type="button"
                  onClick={onSendCode}
                  className="min-h-11 rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary shadow-[var(--shadow-subtle)] transition-colors hover:bg-surface-raised"
                >
                  Send verification code
                </button>
              </div>
            ) : null}

            {step === "final" ? (
              <div className="mt-5 rounded-2xl bg-negative/5 p-4 text-sm leading-5 text-negative">
                Final confirmation is running. If it fails, nothing is changed.
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-full border border-border bg-white px-5 text-sm font-semibold text-text-primary shadow-[var(--shadow-subtle)] transition-colors hover:bg-surface-raised"
              >
                Cancel
              </button>
              {step === "consequences" ? (
                <button
                  type="button"
                  onClick={onNext}
                  className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  Continue to identity check
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onFinal}
                  className="min-h-11 rounded-full border border-negative/30 bg-white px-5 text-sm font-semibold text-negative shadow-[var(--shadow-subtle)] transition-colors hover:bg-negative/5"
                >
                  Confirm delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
