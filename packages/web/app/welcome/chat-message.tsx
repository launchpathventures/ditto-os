"use client";

/**
 * Single message bubble for the front-door conversation.
 * Alex messages left-aligned, user messages right-aligned.
 * Three Alex variants: hero-primary (biggest), hero-secondary (strong), body (conversational).
 * Provenance: Brief 094, DESIGN.md conversation patterns.
 */
export function ChatMessage({
  role,
  text,
  animate = false,
  variant = "body",
}: {
  role: "alex" | "user";
  text: string;
  animate?: boolean;
  variant?: "hero-primary" | "hero-secondary" | "body";
}) {
  if (role === "alex") {
    const styles = {
      "hero-primary":
        "text-3xl font-bold tracking-tight text-text-primary md:text-5xl md:leading-[1.1]",
      "hero-secondary":
        "text-2xl font-semibold tracking-tight text-text-primary md:text-4xl md:leading-[1.15]",
      body: "text-lg leading-relaxed text-text-secondary md:text-xl",
    };

    return (
      <div className={animate ? "animate-fade-in" : ""}>
        <p className={styles[variant]}>{text}</p>
      </div>
    );
  }

  return (
    <div className={`flex justify-end ${animate ? "animate-fade-in" : ""}`}>
      <div className="max-w-[85%] rounded-2xl bg-vivid-subtle px-4 py-3">
        <p className="text-base text-text-primary">{text}</p>
      </div>
    </div>
  );
}
