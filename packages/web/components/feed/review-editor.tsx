"use client";

/**
 * Inline Review Editor
 *
 * Text editor for review items with diff tracking.
 * Captures the edited text and sends it to the server for diff computation.
 *
 * Provenance: Brief 041 AC10, AC12. Slack Peek progressive disclosure pattern.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ReviewEditorProps {
  originalText: string;
  onSave: (editedText: string) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function ReviewEditor({
  originalText,
  onSave,
  onCancel,
  saving = false,
}: ReviewEditorProps) {
  const [editedText, setEditedText] = useState(originalText);
  const hasChanges = editedText !== originalText;

  return (
    <div className="space-y-2">
      <textarea
        className="w-full rounded-lg border border-border bg-surface-raised p-3 text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
        rows={Math.min(Math.max(originalText.split("\n").length + 2, 4), 20)}
        value={editedText}
        onChange={(e) => setEditedText(e.target.value)}
        disabled={saving}
      />
      {hasChanges && (
        <p className="text-xs text-text-muted">
          Changes will be recorded as feedback for future improvements.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onSave(editedText)}
          disabled={!hasChanges || saving}
        >
          {saving ? "Saving..." : "Save changes"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
