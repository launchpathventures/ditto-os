"use client";

/**
 * Typing indicator — three-dot pulse animation with optional status text.
 * Shows while waiting for Alex's response from the chat API.
 * Status text shows what Alex is doing: "Considering…", "Reading that page…", etc.
 * Provenance: iMessage/WhatsApp pattern, Brief 094.
 */
export function TypingIndicator({ status }: { status?: string | null }) {
  return (
    <div className="flex items-center gap-2 py-2 animate-fade-in">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-text-muted"
            style={{
              animation: "pulse-dot 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      {status && (
        <span className="text-sm text-text-muted italic">{status}</span>
      )}
    </div>
  );
}
