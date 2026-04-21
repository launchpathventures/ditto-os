"use client";

/**
 * Ditto — Projects view
 *
 * Each project card: goal, status badge, "next move" narration. No metric
 * walls — the story is Alex-narrated; numbers come on demand.
 */

import React from "react";
import { useProcessList, type ProcessSummary } from "@/lib/process-query";
import { Greet, EmptyHint } from "./view-shell";

interface ProjectsViewProps {
  onSelectProject: (id: string) => void;
  onAskAbout: (subject: string) => void;
}

export function ProjectsView({ onSelectProject, onAskAbout }: ProjectsViewProps) {
  const { data } = useProcessList();
  // Projects are modelled as user processes with a longer-running scope.
  // For now we surface all non-system processes; when a dedicated project
  // primitive lands we'll filter here.
  const projects = (data?.processes ?? []).filter((p) => !p.system);

  return (
    <div>
      <Greet
        title="Projects"
        summary="The longer threads we’re pulling on. Each has a goal, a next move, and the shared context I remember."
      />

      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          onClick={() => onSelectProject(p.id)}
          onAskAbout={() => onAskAbout(p.name)}
        />
      ))}

      {projects.length === 0 && (
        <EmptyHint>
          No projects yet. Tell me a goal and I’ll set one up.
        </EmptyHint>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onClick,
  onAskAbout,
}: {
  project: ProcessSummary;
  onClick: () => void;
  onAskAbout: () => void;
}) {
  const status =
    project.status === "active"
      ? { label: "On track", tone: "ok" as const }
      : project.status === "paused"
        ? { label: "Paused", tone: "warn" as const }
        : { label: "Queued", tone: "idle" as const };

  const tone = {
    ok: {
      color: "var(--color-positive)",
      bg: "rgba(22,163,74,0.05)",
      border: "rgba(22,163,74,0.2)",
    },
    warn: {
      color: "var(--color-caution)",
      bg: "rgba(212,150,10,0.05)",
      border: "rgba(212,150,10,0.2)",
    },
    idle: {
      color: "var(--color-text-muted)",
      bg: "var(--color-background)",
      border: "var(--color-border)",
    },
  }[status.tone];

  return (
    <div
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "18px 20px",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div
          onClick={onClick}
          style={{ cursor: "pointer", flex: 1, minWidth: 0 }}
        >
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {project.name}
          </h3>
          {project.description && (
            <p
              style={{
                fontSize: 13,
                color: "var(--color-text-secondary)",
                lineHeight: 1.55,
                margin: "4px 0 0",
              }}
            >
              {project.description}
            </p>
          )}
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 500,
            padding: "3px 9px",
            borderRadius: 999,
            border: `1px solid ${tone.border}`,
            color: tone.color,
            background: tone.bg,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
          {status.label}
        </span>
      </div>

      <div
        onClick={onAskAbout}
        style={{
          marginTop: 12,
          padding: "10px 12px",
          background: "var(--color-background)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--color-text-primary)",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          border: "1px solid var(--color-border)",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "var(--color-vivid)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          A
        </span>
        <div style={{ flex: 1, lineHeight: 1.5 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--color-text-muted)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              display: "block",
              marginBottom: 2,
            }}
          >
            Next move
          </span>
          {project.recentRunCount > 0
            ? `${project.recentRunCount} recent runs. Ask me what’s in flight.`
            : "Nothing running yet. Ask me to get started."}
        </div>
      </div>
    </div>
  );
}
