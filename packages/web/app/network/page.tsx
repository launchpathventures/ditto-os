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
    <div className="min-h-dvh overflow-hidden bg-[#070b16] text-white">
      <nav className="absolute inset-x-0 top-0 z-30 flex h-[72px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="text-xl font-semibold text-white drop-shadow-[0_1px_12px_rgba(0,0,0,0.45)]">
          ditto
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-colors hover:bg-white/18"
        >
          Sign in
        </Link>
      </nav>
      <NetworkLanding />
    </div>
  );
}
