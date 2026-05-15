"use client";

import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RequestIdentity {
  name: string;
  email: string;
  orgSite: string;
  credibility: string;
}

export function isIdentityCompleteEnough(identity: RequestIdentity): boolean {
  return (
    identity.name.trim().length > 0 &&
    identity.email.trim().length > 0 &&
    (identity.orgSite.trim().length > 0 || identity.credibility.trim().length > 0)
  );
}

const FIELDS: Array<{
  key: keyof RequestIdentity;
  label: string;
  placeholder: string;
  type?: string;
  span?: "full";
}> = [
  { key: "name", label: "Your name", placeholder: "Alex Rivers" },
  { key: "email", label: "Email", placeholder: "you@org.com", type: "email" },
  { key: "orgSite", label: "Org or site", placeholder: "company.com" },
  {
    key: "credibility",
    label: "Why you're credible",
    placeholder: "Founder, GTM lead at X, raising seed, etc.",
    span: "full",
  },
];

export function RequestIdentityCard({
  identity,
  onChange,
  className,
}: {
  identity: RequestIdentity;
  onChange: (next: RequestIdentity) => void;
  className?: string;
}) {
  const complete = isIdentityCompleteEnough(identity);

  function setField<K extends keyof RequestIdentity>(key: K, value: RequestIdentity[K]) {
    onChange({ ...identity, [key]: value });
  }

  return (
    <section
      aria-labelledby="request-identity-heading"
      className={cn(
        "rounded-2xl border border-border bg-surface-raised p-5 md:p-6",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            About you
          </p>
          <h2
            id="request-identity-heading"
            className="mt-1 text-xl font-semibold leading-tight text-text-primary"
          >
            So Mira can introduce you well.
          </h2>
          <p className="mt-1.5 max-w-[480px] text-sm leading-5 text-text-secondary">
            Search-only works without this. Needed before any introduction is sent — recipients will
            see your name, org, and a one-line reason you're credible.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            complete
              ? "bg-accent text-accent-foreground"
              : "border border-border bg-background text-text-muted",
          )}
        >
          {complete ? (
            <>
              <Check className="h-3 w-3" aria-hidden="true" />
              Ready
            </>
          ) : (
            <>
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Optional now
            </>
          )}
        </span>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label
            key={field.key}
            className={cn(
              "block rounded-xl border border-border bg-background p-3 transition focus-within:border-text-primary",
              field.span === "full" ? "sm:col-span-2" : "",
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              {field.label}
            </span>
            <input
              type={field.type ?? "text"}
              value={identity[field.key]}
              onChange={(event) => setField(field.key, event.target.value)}
              placeholder={field.placeholder}
              className="mt-1 w-full bg-transparent text-sm leading-5 text-text-primary outline-none placeholder:text-text-muted"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
