"use client";

/**
 * Ditto — People view
 *
 * Browse Alex's memory of relationships, one card per person. This is
 * Ditto's answer to "what a CRM should be for a solo founder" — last
 * touch, open threads, pattern, Alex's current take.
 *
 * Provenance: Insight-145 (relationship-first beats volume).
 *
 * IMPORTANT — safety: this view intentionally reads from a narrow
 * allowlist (see Brief 199 memories-projection work) and does NOT yet
 * surface arbitrary memory keys. When Brief 199 ships the fail-closed
 * PII / credential filter, wire through it; until then the data shown
 * here is a curated slice that is safe by construction.
 */

import React from "react";
import { Greet, EmptyHint } from "./view-shell";

interface PersonSummary {
  id: string;
  initials: string;
  name: string;
  role?: string;
  lastTouch?: string;
  pattern?: string;
  openThreads?: number;
  takeaway?: string;
}

interface PeopleViewProps {
  onAskAbout: (subject: string) => void;
  onSelectPerson?: (id: string) => void;
}

/**
 * TODO(brief-199): Replace this stub with a hook that queries the
 * memories projection API. The stub returns an empty list so the
 * view ships in the empty-state today; once Brief 199 lands, the
 * stub becomes a real `useRelationships()` hook reading the safe
 * projection.
 */
function useRelationshipsStub(): PersonSummary[] {
  return [];
}

export function PeopleView({ onAskAbout, onSelectPerson }: PeopleViewProps) {
  const people = useRelationshipsStub();

  return (
    <div>
      <Greet
        title="People"
        summary={
          people.length === 0
            ? "I don’t know anyone yet. As we work together, I’ll build up a memory of the people who matter — reachable here, one card each."
            : `I remember ${people.length} ${people.length === 1 ? "person" : "people"}. Click one for what I know.`
        }
      />

      {people.length === 0 ? (
        <EmptyHint>
          Tell me about someone important to your work and I’ll start
          remembering them. Or wait — as emails and meetings flow through, I’ll
          build this up on my own.
        </EmptyHint>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {people.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              onClick={() => onSelectPerson?.(p.id)}
              onAskAbout={() => onAskAbout(p.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({
  person,
  onClick,
  onAskAbout,
}: {
  person: PersonSummary;
  onClick: () => void;
  onAskAbout: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          minWidth: 44,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #059669, #3D5A48)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        {person.initials}
      </div>
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onClick}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {person.name}
        </div>
        {person.role && (
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 2 }}>
            {person.role}
          </div>
        )}
        {person.takeaway && (
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              marginTop: 6,
              lineHeight: 1.45,
            }}
          >
            {person.takeaway}
          </div>
        )}
        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 12,
            fontSize: 11.5,
            color: "var(--color-text-muted)",
          }}
        >
          {person.lastTouch && <span>Last touch · {person.lastTouch}</span>}
          {person.openThreads != null && (
            <span>
              {person.openThreads} open thread{person.openThreads === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onAskAbout}
        style={{
          padding: "6px 10px",
          background: "var(--color-vivid-subtle)",
          color: "var(--color-vivid-deep)",
          border: "1px solid #D1F4E1",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        Ask Alex
      </button>
    </div>
  );
}
