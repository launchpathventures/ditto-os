import { cn } from "@/lib/utils";

export function QuickStartPills({
  pills,
  onSelect,
  disabled,
}: {
  pills: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-label="Suggested questions">
      {pills.slice(0, 4).map((pill) => (
        <button
          key={pill}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(pill)}
          className={cn(
            "min-h-11 rounded-[var(--radius-md)] border border-border bg-white px-3 py-2 text-left text-sm leading-5 text-text-secondary transition",
            "hover:border-text-primary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary",
            "disabled:cursor-default disabled:opacity-50",
          )}
          title={pill}
        >
          {pill}
        </button>
      ))}
    </div>
  );
}
