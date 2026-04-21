"use client";

/**
 * Ditto — Agents view (née Routines)
 *
 * Three trust buckets — Autonomous, You review, Still learning — sit on
 * top of the existing ProcessSummary primitive keyed by trustTier. The
 * narrative is "You've trained N agents. Here's who's running, who needs
 * approval, and who's still learning from you."
 *
 * TODO(brief-201): Hired-agent cards (from ADR-037 / Brief 201) slot into
 * the same trust buckets when that primitive lands — surface them here
 * without a separate view.
 */

import React from "react";
import { useProcessList, type ProcessSummary } from "@/lib/process-query";
import { Greet, EmptyHint } from "./view-shell";

interface AgentsViewProps {
  onSelectAgent: (id: string) => void;
  onAskAbout: (subject: string) => void;
}

const TRUST_COPY: Record<
  string,
  { label: string; sub: string; narrate?: string; tone: "positive" | "neutral" | "warn" }
> = {
  autonomous: {
    label: "Autonomous",
    sub: "I handle entirely",
    narrate: "10+ clean runs, corrections trending down.",
    tone: "positive",
  },
  supervised: {
    label: "You review",
    sub: "I draft, you approve",
    tone: "neutral",
  },
  training: {
    label: "Still learning",
    sub: "needs your touch",
    narrate: "Walk me through it and I’ll improve.",
    tone: "warn",
  },
};

export function AgentsView({ onSelectAgent, onAskAbout }: AgentsViewProps) {
  const { data } = useProcessList();
  const agents = (data?.processes ?? []).filter((p) => !p.system);

  const buckets: Record<string, ProcessSummary[]> = {
    autonomous: [],
    supervised: [],
    training: [],
  };
  for (const a of agents) {
    const tier = (a.trustTier ?? "training").toLowerCase();
    if (tier === "autonomous") buckets.autonomous.push(a);
    else if (tier === "supervised" || tier === "review") buckets.supervised.push(a);
    else buckets.training.push(a);
  }

  const total = agents.length;
  const summary =
    total === 0
      ? "No agents yet. Start a conversation and I’ll learn the first one with you."
      : `You've trained ${total} agent${total === 1 ? "" : "s"}. ${buckets.autonomous.length} I run without you watching, ${buckets.supervised.length} you review, ${buckets.training.length} I'm still learning.`;

  return (
    <div>
      <Greet title="Agents" summary={summary} />
      {(["autonomous", "supervised", "training"] as const).map((tier) => {
        const list = buckets[tier];
        if (list.length === 0) return null;
        const meta = TRUST_COPY[tier];
        return (
          <div key={tier} style={{ marginBottom: 28 }}>
            <header
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom: "1px solid var(--color-border)",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color:
                      meta.tone === "warn" ? "var(--color-caution)" : "var(--color-text-primary)",
                  }}
                >
                  {meta.label}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    marginLeft: 10,
                  }}
                >
                  {list.length} · {meta.sub}
                </span>
              </div>
              {meta.narrate && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    fontStyle: "italic",
                    maxWidth: "40ch",
                    textAlign: "right",
                    lineHeight: 1.5,
                  }}
                >
                  {meta.narrate}
                </div>
              )}
            </header>
            <div>
              {list.map((a) => (
                <AgentRow key={a.id} agent={a} onClick={() => onSelectAgent(a.id)} />
              ))}
            </div>
          </div>
        );
      })}

      {total === 0 && (
        <EmptyHint>No agents yet. Ask me to set one up in chat.</EmptyHint>
      )}
    </div>
  );
}

function AgentRow({ agent, onClick }: { agent: ProcessSummary; onClick: () => void }) {
  const tier = (agent.trustTier ?? "training").toLowerCase();
  const toneColor =
    tier === "autonomous"
      ? "var(--color-positive)"
      : tier === "training"
        ? "var(--color-caution)"
        : "var(--color-vivid)";
  const toneBg =
    tier === "autonomous"
      ? "rgba(22,163,74,0.08)"
      : tier === "training"
        ? "rgba(212,150,10,0.08)"
        : "rgba(5,150,105,0.08)";

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        padding: "12px 2px",
        borderBottom: "1px solid var(--color-border)",
        cursor: "pointer",
        width: "100%",
        fontFamily: "inherit",
        textAlign: "left",
        background: "none",
        border: "none",
        borderBottomStyle: "solid",
        borderBottomColor: "var(--color-border)",
        borderBottomWidth: 1,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: toneBg,
          color: toneColor,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}>
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx={18} cy={6} r={3} />
          <circle cx={6} cy={18} r={3} />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
          {agent.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 3 }}>
          {agent.description ?? `${agent.recentRunCount} recent runs`}
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          color: "var(--color-text-secondary)",
          flexShrink: 0,
          textAlign: "right",
          minWidth: 80,
        }}
      >
        <b
          style={{
            color: toneColor,
            fontWeight: 600,
            display: "block",
            fontSize: 13,
          }}
        >
          {agent.recentRunCount > 0 ? `${agent.recentRunCount} runs` : "—"}
        </b>
        {agent.lastRunStatus ?? agent.status}
      </div>
    </button>
  );
}
