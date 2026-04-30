"use client";

/**
 * /memories/[id] — Memory detail surface (Brief 227 §"Surface 1").
 *
 * Renders the memory's content, type/scope pills, reinforcement history, and
 * the primary `[Promote to all projects]` CTA when project-scoped (or
 * `[Demote to project-scope]` when self-scoped). Tapping the CTA opens the
 * confirmation sheet inline (Designer spec — mobile bottom-sheet, desktop
 * inline below).
 */

import { use, useEffect, useState } from "react";
import { MemoryScopePill, classifyScope } from "@/components/memory-scope-pill";
import {
  MemoryPromoteConfirmation,
  type ProjectChoice,
} from "@/components/memory-promote-confirmation";

interface MemoryRecord {
  id: string;
  type: string;
  content: string;
  scopeType: "process" | "self" | "agent" | "person";
  scopeId: string;
  reinforcementCount: number;
  lastReinforcedAt: number;
  confidence: number;
  appliedProjectIds: string[] | null;
  memoryProjectId: string | null;
  memoryProjectSlug: string | null;
}

interface MemoryDetailResponse {
  memory: MemoryRecord;
  activeProjects: ProjectChoice[];
}

export default function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<MemoryDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function reload() {
    try {
      const res = await fetch(`/api/v1/memories/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MemoryDetailResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
  }, [id]);

  if (error) {
    return (
      <main className="p-4 max-w-3xl mx-auto">
        <p className="text-negative text-sm">Couldn&apos;t load memory: {error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="p-4 max-w-3xl mx-auto">
        <p className="text-text-secondary text-sm">Loading…</p>
      </main>
    );
  }

  const { memory, activeProjects } = data;
  const scopeSource = {
    memoryType: memory.type,
    memoryScopeType: memory.scopeType === "process" ? ("process" as const) :
                     memory.scopeType === "self" ? ("self" as const) : undefined,
    memoryProjectId: memory.memoryProjectId,
    memoryProjectSlug: memory.memoryProjectSlug,
    memoryAppliedProjectIds: memory.appliedProjectIds,
  };
  const variant = classifyScope(scopeSource);
  const isProjectScoped = variant?.kind === "project";
  const isSelfScoped =
    variant?.kind === "all" || variant?.kind === "multi" || variant?.kind === "personal";

  async function handlePromote(
    memoryId: string,
    scope: "all" | { projectIds: string[] },
  ) {
    const res = await fetch(`/api/v1/memories/${memoryId}/scope`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "promote", scope }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.output ?? body.error ?? "Promote failed");
    }
    // Refresh after success — `await fetch` already waits for the DB write,
    // so reload immediately (no setTimeout race / arbitrary delay).
    await reload();
  }

  async function handleDemote(targetProjectId: string) {
    const res = await fetch(`/api/v1/memories/${memory.id}/scope`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "demote", targetProjectId }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.output ?? body.error ?? "Demote failed");
      return;
    }
    reload();
  }

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-surface-subtle border border-border font-medium uppercase tracking-wide">
            {memory.type}
          </span>
          <MemoryScopePill source={scopeSource} />
          <span className="text-text-secondary">
            reinforced {memory.reinforcementCount}× · confidence{" "}
            {Math.round(memory.confidence * 100)}%
          </span>
        </div>
        <h1 className="text-lg font-semibold leading-snug">{memory.content}</h1>
      </header>

      {isProjectScoped && (
        <section className="space-y-3">
          <p className="text-xs italic text-text-secondary">
            A: You can demote this back to a single project later — your choice
            doesn&apos;t lock in.
          </p>
          {!confirmOpen ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="px-4 py-2 rounded bg-vivid text-white text-sm font-medium"
            >
              Promote to all projects
            </button>
          ) : (
            <MemoryPromoteConfirmation
              memoryId={memory.id}
              memoryContent={memory.content}
              sourceProjectSlug={memory.memoryProjectSlug ?? "this project"}
              availableProjects={activeProjects}
              onConfirm={handlePromote}
              onCancel={() => setConfirmOpen(false)}
            />
          )}
        </section>
      )}

      {isSelfScoped && memory.type !== "user_model" && memory.type !== "preference" && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Restrict scope</h2>
          <p className="text-xs italic text-text-secondary">
            Demote this memory back to a single project. Pick a target — only
            currently-active projects are eligible.
          </p>
          <DemotePicker
            availableProjects={
              memory.appliedProjectIds && memory.appliedProjectIds.length > 0
                ? activeProjects.filter((p) =>
                    memory.appliedProjectIds!.includes(p.id),
                  )
                : activeProjects
            }
            onDemote={handleDemote}
          />
        </section>
      )}
    </main>
  );
}

function DemotePicker({
  availableProjects,
  onDemote,
}: {
  availableProjects: ProjectChoice[];
  onDemote: (projectId: string) => void;
}) {
  const [selected, setSelected] = useState<string>(
    availableProjects[0]?.id ?? "",
  );

  if (availableProjects.length === 0) {
    return (
      <p className="text-xs text-text-secondary">
        No active projects available to demote into.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="px-2 py-1 rounded border border-border text-sm"
      >
        {availableProjects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.slug}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => selected && onDemote(selected)}
        className="px-3 py-1.5 rounded bg-vivid text-white text-sm font-medium"
      >
        Demote to {availableProjects.find((p) => p.id === selected)?.slug ?? "…"}
      </button>
    </div>
  );
}
