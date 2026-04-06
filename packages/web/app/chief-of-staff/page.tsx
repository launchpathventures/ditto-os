import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import {
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Eye,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Chief of Staff — Ditto",
  description:
    "AI that runs your operational processes with progressive trust. The antidote to AI slop you can't rely on.",
};

export default function ChiefOfStaffPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <p className="text-xs font-medium uppercase tracking-wider text-vivid">
            Chief of Staff
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
            The antidote to AI
            <br />
            you can&apos;t trust
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-text-secondary">
            Every AI tool promises to &ldquo;automate your work.&rdquo; Then you
            try it, and every conversation starts from scratch. Nothing learns.
            Nothing sticks. You correct the same mistake twelve times. You
            can&apos;t delegate because you can&apos;t trust the output.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-text-secondary">
            Ditto is different. Processes are durable &mdash; defined once,
            improved through use. Trust is earned, not assumed. Corrections
            compound. Your operations actually get better over time.
          </p>
        </div>
      </section>

      {/* The difference */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[960px]">
          <h2 className="text-center text-2xl font-bold text-text-primary">
            What makes Ditto different
          </h2>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-white p-6">
              <ShieldCheck size={24} className="text-vivid" />
              <h3 className="mt-3 text-sm font-semibold text-text-primary">
                Progressive trust
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Everything starts supervised &mdash; you review every output.
                As Ditto proves reliable, it earns less oversight. If quality
                drops, it downgrades itself. You see the evidence: &ldquo;47
                runs, 83% clean, corrections decreasing.&rdquo;
              </p>
            </div>

            <div className="rounded-xl border border-border bg-white p-6">
              <RefreshCw size={24} className="text-vivid" />
              <h3 className="mt-3 text-sm font-semibold text-text-primary">
                Corrections stick
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                When you fix something, Ditto detects the pattern and offers to
                make it permanent. &ldquo;You consistently adjust the labour
                estimate on bathroom jobs. Teach this?&rdquo; One tap. Fixed
                forever.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-white p-6">
              <Eye size={24} className="text-vivid" />
              <h3 className="mt-3 text-sm font-semibold text-text-primary">
                Visible reasoning
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Every output shows what was checked, what passed, and what
                flagged. Confidence scores per item. Source citations. You
                review the harness&apos;s review &mdash; not raw AI output.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-white p-6">
              <CheckCircle2 size={24} className="text-vivid" />
              <h3 className="mt-3 text-sm font-semibold text-text-primary">
                Quiet oversight
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Ditto feels like a quiet reliable team, not a noisy approval
                queue. Daily briefings surface what needs your attention.
                Silence means things are working.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[960px]">
          <h2 className="text-center text-2xl font-bold text-text-primary">
            Who Ditto is for
          </h2>
          <p className="mt-3 text-center text-sm text-text-secondary">
            People responsible for outcomes who are drowning in the operational
            work that prevents strategic thinking.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-raised p-6">
              <h3 className="text-sm font-semibold text-text-primary">
                Business owners
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                &ldquo;I can do the work. I just can&apos;t run the business AND
                do the work.&rdquo; Quoting, invoicing, follow-ups &mdash;
                handled from your phone between jobs.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-raised p-6">
              <h3 className="text-sm font-semibold text-text-primary">
                Operations managers
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                &ldquo;Everything is reactive. I want to be strategic but I
                spend all day putting out fires.&rdquo; Content, pricing,
                compliance &mdash; processes that improve.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-raised p-6">
              <h3 className="text-sm font-semibold text-text-primary">
                Tech generalists
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                &ldquo;I can see 20 things that should be automated. I just
                can&apos;t build 20 solutions.&rdquo; Stand up processes in
                days, prove value in weeks.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-raised p-6">
              <h3 className="text-sm font-semibold text-text-primary">
                Team managers
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                &ldquo;I spend half my day reviewing things I&apos;ve already
                told people how to do.&rdquo; Processes across your team with
                trust you control per person.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-20">
        <div className="mx-auto max-w-[600px] text-center">
          <h2 className="text-2xl font-bold text-text-primary">
            Stop correcting the same thing twice
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            Start with one process. See it improve. Expand when you&apos;re
            ready.
          </p>
          <div className="mt-6">
            <Link
              href="/#get-started"
              className="inline-flex items-center gap-2 rounded-lg bg-vivid px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Get Started
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
