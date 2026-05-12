"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, FileUp, Mic, Pencil, Shield, Type } from "lucide-react";
import { cn } from "@/lib/utils";

type FactVisibility = "public" | "on-request" | "off";

interface KbFact {
  id: string;
  factMd: string;
  visibility: FactVisibility;
  status: "active" | "archived";
  sourceLabel: string;
  sourceLocator?: string | null;
}

interface KbDocument {
  id: string;
  title: string;
  sourceLabel: string;
}

type ShelfStatus = "idle" | "loading" | "success" | "error";

interface KbResponse {
  document?: KbDocument;
  facts?: KbFact[];
  fact?: KbFact;
  rule?: { id: string; ruleMd: string; status: string };
  privateFilters?: Array<{ id: string; ruleMd: string; status: string }>;
}

const VISIBILITY_OPTIONS: Array<{ value: FactVisibility; label: string }> = [
  { value: "public", label: "Public" },
  { value: "on-request", label: "On-request" },
  { value: "off", label: "Off" },
];

export function mergeFacts(existing: KbFact[], incoming: KbFact[]): KbFact[] {
  const byId = new Map(existing.map((fact) => [fact.id, fact]));
  for (const fact of incoming) byId.set(fact.id, fact);
  return Array.from(byId.values()).filter((fact) => fact.status !== "archived");
}

function factVisibilityLabel(value: FactVisibility): string {
  return VISIBILITY_OPTIONS.find((option) => option.value === value)?.label ?? "On-request";
}

export function NetworkKbShelf({
  sessionId,
  className,
}: {
  sessionId?: string | null;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<"source" | "voice" | "manual" | "filters">("source");
  const [status, setStatus] = useState<ShelfStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [facts, setFacts] = useState<KbFact[]>([]);
  const [sourceText, setSourceText] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [visibilityDefault, setVisibilityDefault] = useState<FactVisibility>("on-request");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [manualFact, setManualFact] = useState("");
  const [manualVisibility, setManualVisibility] = useState<FactVisibility>("on-request");
  const [privateFilter, setPrivateFilter] = useState("");
  const [privateFilterId, setPrivateFilterId] = useState<string | null>(null);
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editingFactText, setEditingFactText] = useState("");

  const activeFacts = useMemo(
    () => facts.filter((fact) => fact.status !== "archived"),
    [facts],
  );

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    async function loadShelf() {
      try {
        const response = await fetch(
          `/api/v1/network/kb/visibility?sessionId=${encodeURIComponent(sessionId ?? "")}`,
          {
            method: "GET",
            credentials: "include",
          },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as KbResponse;
        if (cancelled) return;
        setFacts((current) => mergeFacts(current, payload.facts ?? []));
        const firstFilter = payload.privateFilters?.find((filter) => filter.status === "active") ?? null;
        setPrivateFilterId(firstFilter?.id ?? null);
        setPrivateFilter(firstFilter?.ruleMd ?? "");
      } catch {
        // The shelf remains usable for new uploads even if the read path is unavailable.
      }
    }
    void loadShelf();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  function setError(copy: string) {
    setStatus("error");
    setMessage(copy);
  }

  async function uploadSource() {
    const file = fileInputRef.current?.files?.[0] ?? null;
    if (!file && !sourceText.trim()) {
      setError("Add a file or paste source text first.");
      return;
    }

    setStatus("loading");
    setMessage(null);
    const formData = new FormData();
    if (sessionId) formData.set("sessionId", sessionId);
    formData.set("title", sourceTitle.trim() || file?.name || "Pasted source");
    formData.set("sourceLabel", sourceTitle.trim() || file?.name || "Pasted source");
    formData.set("visibilityDefault", visibilityDefault);
    if (file) formData.set("file", file);
    if (sourceText.trim()) formData.set("sourceText", sourceText.trim());

    try {
      const response = await fetch("/api/v1/network/kb/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const payload = (await response.json()) as KbResponse & { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "Upload failed");
      setFacts((current) => mergeFacts(current, payload.facts ?? []));
      setSourceText("");
      setSourceTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus("success");
      setMessage(`${payload.facts?.length ?? 0} source-traced facts added.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  async function saveVoiceTranscript() {
    if (!voiceTranscript.trim()) {
      setError("Paste or review a transcript first.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/network/kb/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          transcriptMd: voiceTranscript.trim(),
          inputMode: "paste",
        }),
      });
      const payload = (await response.json()) as KbResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Voice intake failed");
      setFacts((current) => mergeFacts(current, payload.facts ?? []));
      setVoiceTranscript("");
      setStatus("success");
      setMessage(`${payload.facts?.length ?? 0} facts extracted from the reviewed transcript.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Voice intake failed.");
    }
  }

  async function addManualFact() {
    if (!manualFact.trim()) {
      setError("Write the fact first.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/network/kb/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "manual_fact",
          sessionId,
          factMd: manualFact.trim(),
          visibility: manualVisibility,
        }),
      });
      const payload = (await response.json()) as KbResponse & { error?: string };
      if (!response.ok || !payload.fact) throw new Error(payload.error || "Fact save failed");
      setFacts((current) => mergeFacts(current, [payload.fact as KbFact]));
      setManualFact("");
      setStatus("success");
      setMessage("Fact saved with owner-controlled visibility.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Fact save failed.");
    }
  }

  async function savePrivateFilter() {
    if (!privateFilter.trim()) {
      setError("Write the private filter first.");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/network/kb/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "private_filter",
          sessionId,
          id: privateFilterId,
          ruleMd: privateFilter.trim(),
        }),
      });
      const payload = (await response.json()) as KbResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Private filter save failed");
      setPrivateFilterId(payload.rule?.id ?? privateFilterId);
      setStatus("success");
      setMessage("Private filter saved. It stays out of public and client copy.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Private filter save failed.");
    }
  }

  async function updateFact(fact: KbFact, patch: Partial<Pick<KbFact, "factMd" | "visibility" | "status">>) {
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/network/kb/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "update_fact",
          sessionId,
          factId: fact.id,
          ...patch,
          eventType: patch.status === "archived"
            ? "fact_archived"
            : patch.visibility
              ? "fact_visibility_changed"
              : "fact_edited",
        }),
      });
      const payload = (await response.json()) as KbResponse & { error?: string };
      if (!response.ok || !payload.fact) throw new Error(payload.error || "Fact update failed");
      setFacts((current) => mergeFacts(current, [payload.fact as KbFact]));
      setEditingFactId(null);
      setEditingFactText("");
      setStatus("success");
      setMessage(
        patch.status === "archived"
          ? "Fact archived."
          : patch.visibility
            ? `Visibility set to ${factVisibilityLabel(patch.visibility)}.`
            : "Fact updated.",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Fact update failed.");
    }
  }

  return (
    <section
      data-testid="network-kb-shelf"
      aria-label="Expert knowledge shelf"
      className={cn(
        "grid w-full max-w-[720px] gap-3 rounded-[24px] border border-[#201a17]/10 bg-white/85 p-4 text-[#201a17] shadow-[0_12px_30px_rgba(32,26,23,0.06)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#786a63]">
            Knowledge shelf
          </p>
          <p className="mt-1 text-sm leading-5 text-[#5e514b]">
            Source facts default to on-request.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-[#f8efe4] p-1">
          {[
            ["source", FileUp, "Upload"],
            ["voice", Mic, "Voice"],
            ["manual", Pencil, "Fact"],
            ["filters", Shield, "Private"],
          ].map(([tab, Icon, label]) => (
            <button
              key={tab as string}
              type="button"
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition",
                activeTab === tab
                  ? "bg-[#201a17] text-white"
                  : "text-[#5e514b] hover:bg-white",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label as string}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "source" ? (
        <div className="grid gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.pdf,.csv,.json,text/plain,text/markdown,application/pdf,text/csv,application/json"
            className="block w-full rounded-2xl border border-[#201a17]/10 bg-[#fffaf4] px-3 py-3 text-sm text-[#4a3f39] file:mr-3 file:rounded-full file:border-0 file:bg-[#201a17] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
          />
          <input
            value={sourceTitle}
            onChange={(event) => setSourceTitle(event.target.value)}
            placeholder="Source label"
            className="min-h-11 rounded-2xl border border-[#201a17]/10 bg-[#fffaf4] px-3 text-sm outline-none focus:border-[#201a17]/30"
          />
          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            placeholder="Or paste source notes"
            rows={4}
            className="min-h-[112px] resize-y rounded-2xl border border-[#201a17]/10 bg-[#fffaf4] px-3 py-3 text-sm leading-5 outline-none focus:border-[#201a17]/30"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VisibilityPicker
              value={visibilityDefault}
              onChange={setVisibilityDefault}
              label="Default"
            />
            <button
              type="button"
              disabled={status === "loading"}
              onClick={() => void uploadSource()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#201a17] px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55"
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              Extract facts
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === "voice" ? (
        <div className="grid gap-3">
          <textarea
            value={voiceTranscript}
            onChange={(event) => setVoiceTranscript(event.target.value)}
            placeholder="Paste the reviewed transcript"
            rows={6}
            className="min-h-[148px] resize-y rounded-2xl border border-[#201a17]/10 bg-[#fffaf4] px-3 py-3 text-sm leading-5 outline-none focus:border-[#201a17]/30"
          />
          <button
            type="button"
            disabled={status === "loading"}
            onClick={() => void saveVoiceTranscript()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#201a17] px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            Save transcript
          </button>
        </div>
      ) : null}

      {activeTab === "manual" ? (
        <div className="grid gap-3">
          <textarea
            value={manualFact}
            onChange={(event) => setManualFact(event.target.value)}
            placeholder="Add one fact"
            rows={3}
            className="min-h-[96px] resize-y rounded-2xl border border-[#201a17]/10 bg-[#fffaf4] px-3 py-3 text-sm leading-5 outline-none focus:border-[#201a17]/30"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VisibilityPicker value={manualVisibility} onChange={setManualVisibility} label="Visibility" />
            <button
              type="button"
              disabled={status === "loading"}
              onClick={() => void addManualFact()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#201a17] px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55"
            >
              <Type className="h-4 w-4" aria-hidden="true" />
              Save fact
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === "filters" ? (
        <div className="grid gap-3">
          <textarea
            value={privateFilter}
            onChange={(event) => setPrivateFilter(event.target.value)}
            placeholder="Private disqualification rule"
            rows={4}
            className="min-h-[112px] resize-y rounded-2xl border border-[#201a17]/10 bg-[#fffaf4] px-3 py-3 text-sm leading-5 outline-none focus:border-[#201a17]/30"
          />
          <button
            type="button"
            disabled={status === "loading"}
            onClick={() => void savePrivateFilter()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#201a17] px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55"
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            Save privately
          </button>
        </div>
      ) : null}

      {message ? (
        <p
          role={status === "error" ? "alert" : "status"}
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-5",
            status === "error"
              ? "bg-[#fff0e8] text-[#8d3f25]"
              : "bg-[#f8efe4] text-[#5e514b]",
          )}
        >
          {message}
        </p>
      ) : null}

      {activeFacts.length > 0 ? (
        <div className="grid gap-2 border-t border-[#201a17]/10 pt-3">
          {activeFacts.map((fact) => {
            const editing = editingFactId === fact.id;
            return (
              <div
                key={fact.id}
                className="grid gap-2 rounded-2xl bg-[#fffaf4] p-3 text-sm leading-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[#201a17]">
                    {editing ? null : fact.factMd}
                  </p>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[#786a63]">
                    {factVisibilityLabel(fact.visibility)}
                  </span>
                </div>
                {editing ? (
                  <textarea
                    value={editingFactText}
                    onChange={(event) => setEditingFactText(event.target.value)}
                    rows={3}
                    className="min-h-[88px] resize-y rounded-2xl border border-[#201a17]/10 bg-white px-3 py-3 text-sm outline-none focus:border-[#201a17]/30"
                  />
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate text-xs text-[#786a63]">
                    {fact.sourceLabel}
                    {fact.sourceLocator ? ` · ${fact.sourceLocator}` : ""}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <VisibilityPicker
                      value={fact.visibility}
                      onChange={(value) => void updateFact(fact, { visibility: value })}
                      label="Fact visibility"
                      compact
                    />
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => void updateFact(fact, { factMd: editingFactText.trim() })}
                        className="inline-flex min-h-9 items-center rounded-full bg-[#201a17] px-3 text-xs font-semibold text-white"
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFactId(fact.id);
                          setEditingFactText(fact.factMd);
                        }}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[#5e514b] hover:bg-white"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void updateFact(fact, { status: "archived" })}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[#5e514b] hover:bg-white"
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      Archive
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function VisibilityPicker({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: FactVisibility;
  onChange: (value: FactVisibility) => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#786a63]">
      <span className={compact ? "sr-only" : ""}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as FactVisibility)}
        className="min-h-9 rounded-full border border-[#201a17]/10 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-[#201a17] outline-none focus:border-[#201a17]/30"
      >
        {VISIBILITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
