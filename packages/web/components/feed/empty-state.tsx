"use client";

/**
 * Feed Empty/Loading/Error States
 *
 * Per UX spec 7.2:
 * - Empty: "Nothing here yet. Talk to Self to get started."
 * - Loading: 3 skeleton cards
 * - Error: "Something went wrong. Self can help."
 *
 * Provenance: Brief 041, UX spec 7.2.
 */

import { Card, CardContent } from "@/components/ui/card";

export function FeedEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-lg text-text-secondary">Nothing here yet.</p>
      <p className="mt-1 text-sm text-text-muted">
        Talk to Self to get started.
      </p>
    </div>
  );
}

export function FeedLoading() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="py-5">
            <div className="h-4 w-2/3 rounded bg-border" />
            <div className="mt-3 h-3 w-full rounded bg-border" />
            <div className="mt-2 h-3 w-4/5 rounded bg-border" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function FeedError() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-lg text-negative">Something went wrong.</p>
      <p className="mt-1 text-sm text-text-muted">Self can help.</p>
    </div>
  );
}
