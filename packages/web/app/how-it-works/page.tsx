import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works — Ditto",
  description:
    "Ditto connects your network and runs your operations. Here's how, step by step.",
};

const networkSteps = [
  {
    num: "1",
    title: "Tell Ditto who you want to meet",
    desc: "Sales prospects, potential hires, advisors, partners. Describe what you're looking for in plain language.",
  },
  {
    num: "2",
    title: "Alex or Mira researches and drafts outreach",
    desc: "Personalised, specific, relevant. Not a template. Every email is crafted for the individual recipient.",
  },
  {
    num: "3",
    title: "You review before anything is sent",
    desc: "Every outreach starts supervised. Approve, edit, or reject. Nothing leaves without your say-so.",
  },
  {
    num: "4",
    title: "Ditto follows up and manages replies",
    desc: "Responses are handled, meetings are booked, introductions are brokered. You get briefed on progress.",
  },
  {
    num: "5",
    title: "Your network compounds over time",
    desc: "Ditto remembers every person, every interaction, every outcome. Relationships get stronger, not forgotten.",
  },
];

const chiefOfStaffSteps = [
  {
    num: "1",
    title: "Describe a process you want handled",
    desc: "Quoting, content review, reports, follow-ups. Get Started like a colleague, not a configuration wizard.",
  },
  {
    num: "2",
    title: "Ditto builds it through conversation",
    desc: "No workflow diagrams. No boxes and arrows. Ditto asks questions and proposes a structured process you can review.",
  },
  {
    num: "3",
    title: "Every output starts supervised",
    desc: "You review everything Ditto produces. Daily briefings tell you what needs your attention. Approve, edit, or reject.",
  },
  {
    num: "4",
    title: "Trust is earned, not assumed",
    desc: "As Ditto proves reliable, you check less. The system tracks quality and suggests when it's ready for more autonomy.",
  },
  {
    num: "5",
    title: "Corrections stick forever",
    desc: "When you fix something, Ditto learns. 'You always adjust the labour estimate on bathroom jobs.' One tap — that correction becomes permanent.",
  },
];

function StepList({
  steps,
}: {
  steps: { num: string; title: string; desc: string }[];
}) {
  return (
    <div className="space-y-6">
      {steps.map((step) => (
        <div key={step.num} className="flex gap-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vivid text-sm font-semibold text-white">
            {step.num}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {step.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              {step.desc}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <MarketingLayout>
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
            How Ditto works
          </h1>
          <p className="mt-4 text-lg text-text-secondary">
            Two capabilities. One trusted advisor. Both earn your trust the same
            way &mdash; by proving they&apos;re reliable, every single time.
          </p>
        </div>
      </section>

      {/* Network section */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <p className="text-xs font-medium uppercase tracking-wider text-vivid">
            Super-Connector
          </p>
          <h2 className="mt-2 text-2xl font-bold text-text-primary">
            Ditto as your network
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            Alex and Mira find people, make introductions, and run outreach on
            your behalf. Relationship-first, not volume-first.
          </p>
          <div className="mt-10">
            <StepList steps={networkSteps} />
          </div>
          <div className="mt-8">
            <Link
              href="/network"
              className="inline-flex items-center gap-1 text-sm font-medium text-vivid hover:gap-2 transition-all"
            >
              Learn more about the network <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Chief of Staff section */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <p className="text-xs font-medium uppercase tracking-wider text-vivid">
            Chief of Staff
          </p>
          <h2 className="mt-2 text-2xl font-bold text-text-primary">
            Ditto as your operations
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            Ditto runs your operational processes with progressive trust. The
            antidote to AI you can&apos;t rely on.
          </p>
          <div className="mt-10">
            <StepList steps={chiefOfStaffSteps} />
          </div>
          <div className="mt-8">
            <Link
              href="/chief-of-staff"
              className="inline-flex items-center gap-1 text-sm font-medium text-vivid hover:gap-2 transition-all"
            >
              Learn more about the workspace <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-20">
        <div className="mx-auto max-w-[600px] text-center">
          <h2 className="text-2xl font-bold text-text-primary">
            Simple enough to start in 5 minutes
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            One conversation. One process. Value from day one.
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
