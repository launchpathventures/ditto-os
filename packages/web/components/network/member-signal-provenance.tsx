import { AlertTriangle, FileText, Link2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type MemberSignalSourceStatus =
  | "queued"
  | "reading"
  | "found"
  | "limited"
  | "failed"
  | "needs_paste"
  | "removed";

export function memberSignalSourceStatusLabel(status: MemberSignalSourceStatus): string {
  if (status === "needs_paste") return "needs paste";
  return status.replace("_", " ");
}

export function MemberSignalProvenance({
  sourceLabel,
  sourceUrl,
  confidence,
  inferred = false,
  status,
  className,
}: {
  sourceLabel: string;
  sourceUrl?: string | null;
  confidence?: "high" | "medium" | "low" | string | null;
  inferred?: boolean;
  status?: MemberSignalSourceStatus | null;
  className?: string;
}) {
  const Icon = inferred
    ? Sparkles
    : status === "limited" || status === "needs_paste"
      ? AlertTriangle
      : sourceUrl
        ? Link2
        : FileText;
  const tone = status === "limited" || status === "needs_paste"
    ? "border-[#f1d6a8] bg-[#fff8ec] text-[#77510b]"
    : inferred
      ? "border-border bg-surface-raised text-text-primary"
      : "border-border bg-white text-text-secondary";

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold leading-none",
        tone,
        className,
      )}
      data-testid="member-signal-provenance"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{inferred ? "inferred by Ditto" : sourceLabel}</span>
      {confidence ? (
        <span className="shrink-0 text-text-muted">· {confidence}</span>
      ) : null}
      {status ? (
        <span className="shrink-0 text-text-muted">· {memberSignalSourceStatusLabel(status)}</span>
      ) : null}
    </span>
  );
}
