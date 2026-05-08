import type { Metadata } from "next";
import Link from "next/link";
import { NetworkLanding } from "@/components/marketing/network-landing";

export const metadata: Metadata = {
  title: "Network — Ditto",
  description:
    "A two-sided conversational network for people with expertise and people who need the right person.",
};

export default function NetworkPage() {
  return (
    <div className="min-h-dvh overflow-hidden bg-background text-text-primary">
      <nav className="relative z-30 flex h-[72px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="text-xl font-semibold text-text-primary">
          ditto
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised"
        >
          Sign in
        </Link>
      </nav>
      <NetworkLanding />
    </div>
  );
}
