"use client";

/**
 * Typing indicator — three-dot pulse animation.
 * Shows while waiting for Alex's response from the chat API.
 * Provenance: iMessage/WhatsApp pattern, Brief 094.
 */
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2 animate-fade-in">
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
  );
}
