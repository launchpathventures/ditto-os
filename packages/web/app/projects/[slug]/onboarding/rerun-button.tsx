"use client";

/**
 * Brief 228 — Re-run retrofit button.
 *
 * Client component embedded in the Server Component
 * `/projects/:slug/onboarding/page.tsx` so the user can trigger a fresh
 * `project-retrofit.yaml` invocation on demand.
 *
 * POSTs to `/api/v1/projects/:id/retrofit` with `{ kind: "on-demand-rerun" }`
 * (trustTier omitted — the route reads the project's last-known tier).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface Props {
  projectId: string;
}

export function RerunRetrofitButton({ projectId }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/retrofit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "on-demand-rerun" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={submitting}
      >
        <RefreshCw
          className={
            submitting
              ? "mr-2 h-3.5 w-3.5 animate-spin"
              : "mr-2 h-3.5 w-3.5"
          }
        />
        {submitting ? "Triggering…" : "Re-run retrofit"}
      </Button>
      {error && <p className="text-xs text-negative">{error}</p>}
    </div>
  );
}
