import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { ArrowRight, Check, Zap, Users, Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing — Ditto",
  description:
    "Start free. Pay when Ditto delivers. Simple pricing that grows with you.",
};

// ============================================================
// Data
// ============================================================

const freeFeatures = [
  "Unlimited conversations with Alex",
  "Alex researches real targets for you",
  "See exactly how Alex frames introductions",
  "3 free outreach sends",
  "Your first Chief of Staff briefing",
];

const successFeeRows = [
  {
    outcome: "Introduction sent",
    connector: "Free",
    sales: "Free",
    note: "Sending is the baseline",
  },
  {
    outcome: "Response received",
    connector: "$3",
    sales: "$7",
    note: "Signal that quality landed",
  },
  {
    outcome: "Meeting booked",
    connector: "$20",
    sales: "$35",
    note: "Real value delivered",
  },
];

const tiers = [
  {
    name: "Starter",
    price: "$29",
    period: "/month",
    description: "For solo operators testing the waters",
    icon: Zap,
    features: [
      "Weekly priorities briefing",
      "5 process runs per month",
      "Basic workspace",
      "Memory & learning",
      "Email support",
    ],
    cta: "Start with Starter",
    popular: false,
  },
  {
    name: "Professional",
    price: "$79",
    period: "/month",
    description: "For people who trust Ditto to run things",
    icon: Users,
    features: [
      "Daily briefings",
      "Unlimited process runs",
      "Full workspace with all tools",
      "Knowledge base ingestion",
      "Progressive trust automation",
      "Priority support",
    ],
    cta: "Go Professional",
    popular: true,
  },
  {
    name: "Business",
    price: "$199",
    period: "/month",
    description: "For teams where Ditto is infrastructure",
    icon: Building2,
    features: [
      "Everything in Professional",
      "Multiple team contexts",
      "Priority execution queue",
      "Custom integrations",
      "Dedicated onboarding",
      "SLA guarantee",
    ],
    cta: "Contact Us",
    popular: false,
  },
];

// ============================================================
// Components
// ============================================================

function FeatureCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Check
        size={16}
        className="mt-0.5 shrink-0 text-vivid"
        strokeWidth={2.5}
      />
      <span className="text-sm text-text-secondary">{children}</span>
    </li>
  );
}

// ============================================================
// Page
// ============================================================

export default function PricingPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px] text-center">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
            Start free. Pay when Ditto delivers.
          </h1>
          <p className="mt-4 text-lg text-text-secondary">
            Alex is free to talk to. Outreach is free to send. You only pay when
            something actually works &mdash; a response, a meeting, a
            relationship that wouldn&apos;t have existed without Ditto.
          </p>
        </div>
      </section>

      {/* Free Tier */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <div className="rounded-xl border border-border bg-white p-8 md:p-10">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-text-primary">$0</span>
              <span className="text-sm text-text-muted">forever</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-text-primary">
              Meet Alex
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Have a real conversation. See real research. Get real outreach
              drafted &mdash; before you pay anything.
            </p>

            <ul className="mt-8 space-y-3">
              {freeFeatures.map((f) => (
                <FeatureCheck key={f}>{f}</FeatureCheck>
              ))}
            </ul>

            <div className="mt-8">
              <Link
                href="/#get-started"
                className="inline-flex items-center gap-2 rounded-lg bg-vivid px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                Talk to Alex
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Success Fees — Network */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <p className="text-xs font-medium uppercase tracking-wider text-vivid">
            Network
          </p>
          <h2 className="mt-2 text-2xl font-bold text-text-primary">
            Pay for outcomes, not sends
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            Alex&apos;s reputation is what makes introductions land. We only
            earn when that reputation delivers &mdash; a response, a meeting, a
            relationship. If Alex sends something that doesn&apos;t work, that
            costs us, not you.
          </p>

          {/* Fee table */}
          <div className="mt-10 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                    Outcome
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                    Connector
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                    Sales
                  </th>
                </tr>
              </thead>
              <tbody>
                {successFeeRows.map((row, i) => (
                  <tr
                    key={row.outcome}
                    className={
                      i < successFeeRows.length - 1
                        ? "border-b border-border"
                        : ""
                    }
                  >
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium text-text-primary">
                        {row.outcome}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-muted">
                        {row.note}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-text-primary">
                      {row.connector}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-text-primary">
                      {row.sales}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-lg border border-vivid/20 bg-vivid/5 px-5 py-4">
            <p className="text-sm text-text-secondary">
              <span className="font-semibold text-vivid">
                Why outcome-based?
              </span>{" "}
              If we charged per send, we&apos;d be incentivised to send more.
              Charging on outcomes means Ditto is incentivised to send better.
              Five great introductions that get responses beat fifty that
              don&apos;t.
            </p>
          </div>
        </div>
      </section>

      {/* Subscription Tiers — Workspace */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[960px]">
          <div className="mx-auto max-w-[720px] text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-vivid">
              Workspace
            </p>
            <h2 className="mt-2 text-2xl font-bold text-text-primary">
              When Ditto runs your operations
            </h2>
            <p className="mt-3 text-sm text-text-secondary">
              The workspace is where Ditto becomes your Chief of Staff &mdash;
              briefings, process execution, memory that compounds. Subscribe
              when you&apos;re ready to let Ditto handle things.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl border p-6 transition-shadow hover:shadow-md ${
                  tier.popular
                    ? "border-vivid bg-white shadow-sm"
                    : "border-border bg-white"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-vivid px-3 py-0.5 text-xs font-semibold text-white">
                    Most popular
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      tier.popular
                        ? "bg-vivid text-white"
                        : "bg-surface text-text-secondary"
                    }`}
                  >
                    <tier.icon size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      {tier.name}
                    </h3>
                    <p className="text-xs text-text-muted">{tier.description}</p>
                  </div>
                </div>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-text-primary">
                    {tier.price}
                  </span>
                  <span className="text-sm text-text-muted">{tier.period}</span>
                </div>

                <ul className="mt-6 space-y-3">
                  {tier.features.map((f) => (
                    <FeatureCheck key={f}>{f}</FeatureCheck>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    href="/#get-started"
                    className={`block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                      tier.popular
                        ? "bg-vivid text-white hover:bg-accent-hover"
                        : "border border-border bg-white text-text-primary hover:bg-surface"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-text-muted">
            All plans include network success fees. Workspace subscription is
            separate from and additive to outreach outcomes.
          </p>
        </div>
      </section>

      {/* How the trust ladder works */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <h2 className="text-2xl font-bold text-text-primary">
            You decide when to upgrade
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            Ditto follows the same trust model with pricing that it uses for
            everything else. Start supervised. Prove value. Earn more
            responsibility. You control the pace.
          </p>

          <div className="mt-10 space-y-0">
            {[
              {
                stage: "Day 1",
                label: "Free",
                desc: "Talk to Alex. See real research. Get 3 free outreach sends.",
              },
              {
                stage: "Week 1",
                label: "Success fees",
                desc: "Responses start coming in. You pay $3-7 per response, $20-35 per meeting.",
              },
              {
                stage: "Week 2-3",
                label: "Starter",
                desc: "You've seen 5+ outcomes. Weekly briefings and process runs make sense.",
              },
              {
                stage: "Month 2",
                label: "Professional",
                desc: "Processes are running. Ditto is handling things autonomously. Daily briefings keep you informed.",
              },
              {
                stage: "Month 3+",
                label: "Business",
                desc: "Ditto is infrastructure. Your team relies on it. Priority execution and integrations matter.",
              },
            ].map((step, i, arr) => (
              <div key={step.stage} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vivid text-xs font-bold text-white">
                    {i + 1}
                  </div>
                  {i < arr.length - 1 && (
                    <div className="mt-1 h-full w-px bg-border" />
                  )}
                </div>
                <div className={i < arr.length - 1 ? "pb-8" : "pb-0"}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-text-muted">
                      {step.stage}
                    </span>
                    <span className="rounded-full bg-vivid/10 px-2 py-0.5 text-xs font-semibold text-vivid">
                      {step.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <h2 className="text-2xl font-bold text-text-primary">
            Common questions
          </h2>

          <div className="mt-10 space-y-8">
            {[
              {
                q: "What's the difference between connector and sales mode?",
                a: "In connector mode, Alex reaches out as himself — making introductions using his reputation. In sales mode, Alex reaches out as your company — your brand, your voice, your positioning. Sales mode costs more because the stakes are higher.",
              },
              {
                q: "How do you track responses and meetings?",
                a: "Responses are tracked automatically through email. For meetings, we follow up with a simple confirmation. We're building deeper CRM integrations for automatic meeting detection.",
              },
              {
                q: "Can I use the network without a workspace subscription?",
                a: "Yes. Many users start with just the network — Alex making introductions, paying per outcome. The workspace subscription is for when you want Ditto running operational processes too.",
              },
              {
                q: "What happens to my data if I cancel?",
                a: "Your relationship data, memories, and process history remain intact. You can reactivate anytime and pick up where you left off. Ditto remembers.",
              },
              {
                q: "Is there a limit on outreach sends?",
                a: "No artificial limit, but Alex self-limits based on quality. Ditto would rather send 5 perfect introductions than 50 mediocre ones. That's not a marketing line — it's how the system is built.",
              },
              {
                q: "What if Alex sends something that doesn't work?",
                a: "You don't pay. If an introduction doesn't get a response, that costs us (compute), not you. This is why we're incentivised to get every single outreach right.",
              },
            ].map((faq) => (
              <div key={faq.q}>
                <h3 className="text-sm font-semibold text-text-primary">
                  {faq.q}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-[600px] text-center">
          <h2 className="text-2xl font-bold text-text-primary">
            See what Alex can do
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            One conversation. Real research. Real outreach. No credit card.
          </p>
          <div className="mt-6">
            <Link
              href="/#get-started"
              className="inline-flex items-center gap-2 rounded-lg bg-vivid px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Talk to Alex — it&apos;s free
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
