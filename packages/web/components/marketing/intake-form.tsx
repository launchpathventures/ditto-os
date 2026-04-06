"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

type FormState = "idle" | "submitting" | "success" | "error";

export function IntakeForm({ id }: { id?: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [need, setNeed] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/network/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, need: need || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong.");
      }

      setState("success");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "success") {
    return (
      <div id={id} className="rounded-xl border border-vivid/20 bg-vivid-subtle p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-vivid">
          <Check size={20} className="text-white" />
        </div>
        <h3 className="text-lg font-semibold text-text-primary">Check your email</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Ditto will reach out shortly. The conversation continues in your inbox.
        </p>
      </div>
    );
  }

  return (
    <form id={id} onSubmit={handleSubmit} className="mx-auto w-full max-w-md space-y-3">
      <div className="flex gap-2">
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-white px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-1 focus:ring-vivid"
        />
        <button
          type="submit"
          disabled={state === "submitting"}
          className="inline-flex items-center gap-2 rounded-lg bg-vivid px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {state === "submitting" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              Get Started
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>

      <input
        type="text"
        placeholder="Your name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-1 focus:ring-vivid"
      />

      <input
        type="text"
        placeholder="What can Ditto help with? (optional)"
        value={need}
        onChange={(e) => setNeed(e.target.value)}
        className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-1 focus:ring-vivid"
      />

      {state === "error" && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <p className="text-xs text-text-muted">
        Ditto will email you to start the conversation. No account needed.
      </p>
    </form>
  );
}
