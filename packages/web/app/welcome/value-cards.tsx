"use client";

import Link from "next/link";
import { ArrowRight, Users, Shield } from "lucide-react";

/**
 * Two value prop cards below the fold — safety net for cold traffic scrollers.
 * Super-Connector + Chief of Staff with "Learn more →" links.
 * Provenance: DESIGN.md Section 10 Page 1, Brief 094.
 */
export function ValueCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ValueCard
        icon={<Users size={24} className="text-vivid" />}
        title="Super-Connector"
        description="AI outreach that people actually respond to. 5 great emails a week, not 500 generic ones."
        href="/network"
      />
      <ValueCard
        icon={<Shield size={24} className="text-vivid" />}
        title="Chief of Staff"
        description="The antidote to AI you can't trust. Processes that learn, corrections that stick."
        href="/chief-of-staff"
      />
    </div>
  );
}

function ValueCard({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-white p-6 transition-shadow hover:shadow-subtle"
    >
      <div className="mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-sm text-text-secondary">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-vivid">
        Learn more <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
