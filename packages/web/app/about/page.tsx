import type { Metadata } from "next";
import { MarketingLayout } from "@/components/marketing/marketing-layout";

export const metadata: Metadata = {
  title: "About — Ditto",
  description:
    "Ditto is a trusted advisor and super-connector. An institution with faces, not a chatbot.",
};

export default function AboutPage() {
  return (
    <MarketingLayout>
      <article className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[720px]">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
            About Ditto
          </h1>

          <div className="mt-10 space-y-8 text-base leading-relaxed text-text-secondary">
            <p>
              Ditto is a trusted advisor and super-connector. Not an assistant
              that does what you say. Not a chatbot that answers questions. A
              teammate who remembers, learns, challenges, and acts &mdash; with
              their own professional identity and compounding reputation.
            </p>

            <p>
              Think of Ditto as a boutique advisory firm with two exceptional
              people. You trust the firm AND your specific person. They
              reinforce each other.
            </p>

            <div className="rounded-xl border border-border bg-vivid-subtle p-6">
              <p className="text-sm font-medium text-text-primary">
                &ldquo;I&apos;ll fight hard in your corner. I&apos;ll also tell
                you no sometimes. When I do, it&apos;s because I&apos;m
                protecting the thing that makes me useful &mdash; which is that
                when I reach out to someone, they pay attention.&rdquo;
              </p>
            </div>

            <h2 className="pt-4 text-xl font-semibold text-text-primary">
              What we believe
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Candour over comfort",
                  desc: "Ditto tells you what you need to hear, not what you want to hear.",
                },
                {
                  title: "Reputation is the product",
                  desc: "Every outreach either builds or burns Ditto's name. Quality is never traded for speed.",
                },
                {
                  title: "Earned trust, not assumed",
                  desc: "Ditto starts supervised. Every good interaction earns more autonomy. One bad one resets it.",
                },
                {
                  title: "Memory is continuity",
                  desc: "Ditto remembers the specific thing you said last month. That recall is what makes the relationship real.",
                },
                {
                  title: "Silence is a feature",
                  desc: "When things are running well, Ditto doesn't check in. Absence of noise IS the signal.",
                },
                {
                  title: "No spam, ever",
                  desc: "Ditto will refuse to send outreach it doesn't believe will be welcomed. This is the core trust mechanism.",
                },
              ].map((value) => (
                <div
                  key={value.title}
                  className="rounded-lg border border-border bg-white p-5"
                >
                  <h3 className="text-sm font-semibold text-text-primary">
                    {value.title}
                  </h3>
                  <p className="mt-1 text-sm text-text-muted">{value.desc}</p>
                </div>
              ))}
            </div>

            <h2 className="pt-4 text-xl font-semibold text-text-primary">
              Meet Alex and Mira
            </h2>

            <p>
              Ditto is the institution. Alex and Mira are the faces. They share
              the same values, the same judgment, the same memory. What makes
              them different is voice: Alex is warm, direct, and Australian.
              Mira is precise, quietly confident, and British.
            </p>

            <p>
              When Alex introduces you to someone, they remember the context
              from three conversations ago. When Mira follows up on an
              introduction, she references the specific thing you mentioned
              last month. This consistency is what makes the relationship
              compound over time.
            </p>

            <p>
              Recipients who&apos;ve been introduced by Alex for three different
              users should say &ldquo;Alex always sends thoughtful
              intros&rdquo; &mdash; they shouldn&apos;t notice Alex feels
              different depending on who&apos;s being introduced.
            </p>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
