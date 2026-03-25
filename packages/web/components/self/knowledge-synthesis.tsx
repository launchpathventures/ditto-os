"use client";

/**
 * Ditto — Knowledge Synthesis Card
 *
 * Shows what the Self has learned about the user, categorised
 * by dimension with completeness indicators. Editable — corrections
 * are captured as feedback.
 *
 * Rendered inline in conversation during onboarding.
 *
 * Provenance: Brief 044 (AC8), Insight-083 (knowledge visible and traceable).
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

interface KnowledgeEntry {
  dimension: string;
  content: string;
  confidence: number;
}

interface KnowledgeSynthesisProps {
  entries: KnowledgeEntry[];
  totalDimensions: number;
  onConfirm?: () => void;
  onCorrect?: (corrections: string) => void;
}

const DIMENSION_LABELS: Record<string, string> = {
  problems: "What's not working",
  tasks: "Immediate needs",
  work: "How you work",
  challenges: "Recurring difficulties",
  communication: "How you prefer to interact",
  frustrations: "What frustrates you",
  vision: "Where you want to be",
  goals: "What you're working toward",
  concerns: "What worries you",
};

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.7
      ? "bg-green-400"
      : confidence >= 0.4
        ? "bg-amber-400"
        : "bg-gray-300";
  return <span className={cn("inline-block w-2 h-2 rounded-full", color)} />;
}

export function KnowledgeSynthesis({
  entries,
  totalDimensions,
  onConfirm,
  onCorrect,
}: KnowledgeSynthesisProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [corrections, setCorrections] = useState("");
  const completeness = Math.round((entries.length / totalDimensions) * 100);

  return (
    <div className="my-4 rounded-xl border border-border bg-surface-primary shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-surface-secondary/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">
            What I've learned so far
          </span>
          <span className="text-xs text-text-tertiary">
            {completeness}% complete
          </span>
        </div>
        {/* Completeness bar */}
        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${completeness}%` }}
          />
        </div>
      </div>

      {/* Entries */}
      <div className="px-4 py-3 space-y-2">
        {entries.map((entry) => (
          <div key={entry.dimension} className="flex items-start gap-2">
            <ConfidenceDot confidence={entry.confidence} />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-text-secondary">
                {DIMENSION_LABELS[entry.dimension] ?? entry.dimension}
              </span>
              <p className="text-sm text-text-primary leading-snug">
                {entry.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex gap-2">
        {!isEditing ? (
          <>
            <button
              onClick={() => onConfirm?.()}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              This looks right
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-border text-text-secondary hover:bg-surface-secondary transition-colors"
            >
              Let me fix something
            </button>
          </>
        ) : (
          <div className="flex-1 space-y-2">
            <textarea
              value={corrections}
              onChange={(e) => setCorrections(e.target.value)}
              placeholder="What would you change?"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent"
              rows={2}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onCorrect?.(corrections);
                  setIsEditing(false);
                  setCorrections("");
                }}
                disabled={!corrections.trim()}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                Save correction
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setCorrections("");
                }}
                className="px-3 py-1.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
