import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { ArrowRight, Users, Target, MessageCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Network — Ditto",
  description:
    "Alex and Mira are named AI intermediaries who build real relationships. 5 great emails a week, not 500 generic ones.",
};

export default function NetworkPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <p className="text-xs font-medium uppercase tracking-wider text-vivid">
            Super-Connector
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
            AI outreach that people
            <br />
            actually respond to
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-text-secondary">
            The AI SDR market has a problem: 50-70% churn within 3 months. Mass
            emails don&apos;t work. Ditto takes the opposite approach &mdash;
            fewer messages, better relationships, compounding reputation.
          </p>
        </div>
      </section>

      {/* The problem */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <h2 className="text-2xl font-bold text-text-primary">
            Volume-first doesn&apos;t work
          </h2>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-text-secondary">
            <p>
              AI SDR tools send 500 generic emails a week. Recipients tune them
              out. Open rates crater. Your domain reputation suffers. Three
              months later, you&apos;re churning off the platform with nothing
              to show for it.
            </p>
            <p>
              The hybrid model &mdash; AI drafting with human oversight &mdash;
              generates 2.3x more revenue than AI-only. That&apos;s exactly how
              Ditto works: AI does the research and drafting, you make the
              decisions.
            </p>
          </div>
        </div>
      </section>

      {/* Ditto's approach */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[960px]">
          <h2 className="text-center text-2xl font-bold text-text-primary">
            What Ditto does differently
          </h2>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-white p-6">
              <Users size={24} className="text-vivid" />
              <h3 className="mt-3 text-sm font-semibold text-text-primary">
                Named intermediary
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Alex and Mira aren&apos;t anonymous tools. They have names,
                voices, and a compounding reputation. When Alex reaches out,
                recipients pay attention because Alex has been consistently
                useful.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-white p-6">
              <Target size={24} className="text-vivid" />
              <h3 className="mt-3 text-sm font-semibold text-text-primary">
                Relationship-first
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                5 great emails a week, not 500 generic ones. Every message is
                individually crafted for the recipient. Ditto will refuse to
                send outreach it doesn&apos;t believe will be welcomed.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-white p-6">
              <MessageCircle size={24} className="text-vivid" />
              <h3 className="mt-3 text-sm font-semibold text-text-primary">
                Memory compounds
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Every person, every interaction, every outcome is remembered.
                When Ditto follows up three weeks later, it references the
                specific thing from the last conversation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Two modes */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[960px]">
          <h2 className="text-center text-2xl font-bold text-text-primary">
            Two modes, one character
          </h2>
          <p className="mt-3 text-center text-sm text-text-secondary">
            Same values, same voice, same trust model. Different posture
            depending on what you need.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-white p-8">
              <p className="text-xs font-medium uppercase tracking-wider text-vivid">
                Selling
              </p>
              <h3 className="mt-2 text-lg font-semibold text-text-primary">
                Ditto as your BDR
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                You agree on a plan together, then Ditto runs with it &mdash;
                finding prospects, drafting outreach, following up, booking
                meetings. Proactive within the mandate. Bolder. Trust tiers
                govern how much approval you give.
              </p>
              <div className="mt-6 rounded-lg bg-vivid-subtle p-4">
                <p className="text-sm italic text-text-secondary">
                  &ldquo;Hi Sarah &mdash; I&apos;m Alex from Ditto. Not a mass
                  email. I only reach out when I genuinely think there&apos;s a
                  fit.&rdquo;
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-white p-8">
              <p className="text-xs font-medium uppercase tracking-wider text-vivid">
                Connecting
              </p>
              <h3 className="mt-2 text-lg font-semibold text-text-primary">
                Ditto as your advisor
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                You say what you need &mdash; &ldquo;a logistics
                consultant,&rdquo; &ldquo;people in fintech.&rdquo; Ditto finds
                names, reports back with context, and asks: &ldquo;Would you
                like me to introduce you?&rdquo; You always decide.
                Introductions are always approved.
              </p>
              <div className="mt-6 rounded-lg bg-vivid-subtle p-4">
                <p className="text-sm italic text-text-secondary">
                  &ldquo;Sarah, meet James. I wouldn&apos;t introduce you if I
                  didn&apos;t think it&apos;d be worth both your time.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <h2 className="text-2xl font-bold text-text-primary">
            Trust built in, not bolted on
          </h2>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-text-secondary">
            <p>
              Every outreach email is reviewed by you until Ditto earns your
              trust. Introductions are always approved &mdash; they&apos;re
              personal and high-stakes. Ditto will refuse to send a message it
              doesn&apos;t believe will be welcomed. That refusal is not a bug.
              It&apos;s the core trust mechanism.
            </p>
            <p>
              When Ditto says no, it explains why and offers an alternative.
              &ldquo;I know you want me to connect you with Sarah, but her
              team&apos;s problem is in a completely different space. This intro
              would waste both your time and cost me credibility with
              her.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-surface px-6 py-16 md:py-20">
        <div className="mx-auto max-w-[600px] text-center">
          <h2 className="text-2xl font-bold text-text-primary">
            Build a network that compounds
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            Start with one introduction. See what quality outreach feels like.
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
