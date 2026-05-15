"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RequestIntake } from "@/components/network/request-intake";
import { RequestReview, type ActiveRequestDraft } from "@/components/network/request-review";
import { useState } from "react";

export function RequestWorkspace({ initialNeed }: { initialNeed?: string }) {
  const [draft, setDraft] = useState<ActiveRequestDraft | null>(null);
  const [visitorSessionId, setVisitorSessionId] = useState<string | null>(null);

  return (
    <main className="min-h-[calc(100dvh-72px)] bg-background px-5 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-[1180px]">
        <Link
          href="/network"
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-text-secondary transition hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Network
        </Link>

        <div className="mt-5 grid gap-4">
          <RequestIntake
            initialNeed={initialNeed}
            onDraft={(nextDraft, nextVisitorSessionId) => {
              setDraft(nextDraft);
              setVisitorSessionId(nextVisitorSessionId);
            }}
          />
          {draft && visitorSessionId ? (
            <RequestReview initialDraft={draft} visitorSessionId={visitorSessionId} />
          ) : null}
        </div>
      </div>
    </main>
  );
}
