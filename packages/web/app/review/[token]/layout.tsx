/**
 * Review Page Layout (Brief 106)
 *
 * Minimal layout — no sidebar, no workspace chrome. Clean, focused
 * review surface with Ditto branding only. Referrer-Policy: no-referrer
 * to prevent token leaking via referrer headers.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ditto — Review",
  description: "Review page from your Ditto advisor",
  referrer: "no-referrer",
};

export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header — Ditto branding only, no navigation */}
      <header className="border-b border-border/50 px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <span className="text-lg font-semibold text-text-primary">Ditto</span>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
