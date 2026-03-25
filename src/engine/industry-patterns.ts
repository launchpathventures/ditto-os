/**
 * Ditto — Industry Patterns
 *
 * Structured data: business type → typical process patterns.
 * Used by suggest_next to identify coverage gaps — "other trades
 * businesses find it useful to..."
 *
 * Based on APQC process framework (pattern level — generic process
 * categories adapted per industry). Stored as structured data in
 * the engine, not hardcoded in prompts (Brief 043 constraint).
 *
 * Provenance: APQC process framework (pattern), Brief 043.
 */

// ============================================================
// Types
// ============================================================

export interface ProcessPattern {
  /** Short identifier */
  id: string;
  /** Human-friendly name (plain language, no system vocab) */
  name: string;
  /** What this process does */
  description: string;
  /** Importance: core (every business needs), common (most need), optional */
  importance: "core" | "common" | "optional";
  /** Keywords that help match against existing processes */
  keywords: string[];
}

export interface IndustryProfile {
  /** Industry identifier */
  id: string;
  /** Human-friendly industry name */
  name: string;
  /** Keywords that help match business descriptions */
  matchKeywords: string[];
  /** Typical processes for this industry */
  patterns: ProcessPattern[];
}

// ============================================================
// Industry Profiles
// ============================================================

export const INDUSTRY_PROFILES: IndustryProfile[] = [
  {
    id: "trades",
    name: "Trades & Construction",
    matchKeywords: [
      "plumbing", "electrical", "building", "construction", "renovation",
      "trades", "contractor", "HVAC", "roofing", "painting", "carpentry",
      "landscaping", "flooring", "tiling", "plumber", "electrician",
    ],
    patterns: [
      {
        id: "quoting",
        name: "Quoting & Estimation",
        description: "Generate quotes with materials, labour, and margin calculations",
        importance: "core",
        keywords: ["quote", "estimate", "pricing", "bid", "tender"],
      },
      {
        id: "job-scheduling",
        name: "Job Scheduling",
        description: "Schedule jobs across team members with dependencies and travel time",
        importance: "core",
        keywords: ["schedule", "calendar", "booking", "dispatch", "roster"],
      },
      {
        id: "invoicing",
        name: "Invoicing & Payment",
        description: "Generate invoices from completed work and track payments",
        importance: "core",
        keywords: ["invoice", "payment", "billing", "accounts", "receivable"],
      },
      {
        id: "supplier-management",
        name: "Supplier & Materials",
        description: "Track supplier prices, manage orders, monitor material costs",
        importance: "common",
        keywords: ["supplier", "materials", "ordering", "stock", "inventory"],
      },
      {
        id: "client-followup",
        name: "Client Follow-up",
        description: "Follow up on outstanding quotes, check satisfaction after jobs",
        importance: "common",
        keywords: ["follow-up", "client", "customer", "satisfaction", "feedback"],
      },
      {
        id: "compliance",
        name: "Compliance & Certification",
        description: "Track licences, certifications, safety inspections, and compliance deadlines",
        importance: "common",
        keywords: ["compliance", "licence", "certification", "safety", "inspection"],
      },
    ],
  },
  {
    id: "professional-services",
    name: "Professional Services & Consulting",
    matchKeywords: [
      "consulting", "advisory", "accounting", "legal", "architecture",
      "engineering", "surveying", "quantity surveyor", "law firm",
      "accountant", "financial", "immigration", "services",
    ],
    patterns: [
      {
        id: "client-intake",
        name: "Client Intake & Onboarding",
        description: "Qualify new clients, gather requirements, set up engagement",
        importance: "core",
        keywords: ["intake", "onboarding", "client", "engagement", "qualification"],
      },
      {
        id: "proposal-generation",
        name: "Proposal & Scope",
        description: "Generate proposals, scope work, get sign-off",
        importance: "core",
        keywords: ["proposal", "scope", "bid", "pitch", "tender"],
      },
      {
        id: "deliverable-review",
        name: "Deliverable Review & QA",
        description: "Review work products before delivery, ensure quality standards",
        importance: "core",
        keywords: ["review", "QA", "quality", "deliverable", "check"],
      },
      {
        id: "time-tracking",
        name: "Time & Billing",
        description: "Track time, generate invoices, manage WIP",
        importance: "core",
        keywords: ["time", "billing", "timesheet", "WIP", "hours"],
      },
      {
        id: "knowledge-management",
        name: "Knowledge & Precedent",
        description: "Capture learnings, build precedent library, share expertise",
        importance: "common",
        keywords: ["knowledge", "precedent", "template", "library", "learning"],
      },
      {
        id: "client-reporting",
        name: "Client Reporting",
        description: "Regular status updates, progress reports, KPI dashboards for clients",
        importance: "common",
        keywords: ["report", "status", "update", "dashboard", "KPI"],
      },
    ],
  },
  {
    id: "ecommerce",
    name: "E-commerce & Retail",
    matchKeywords: [
      "ecommerce", "e-commerce", "shop", "store", "retail", "online",
      "products", "marketplace", "Shopify", "WooCommerce", "selling",
    ],
    patterns: [
      {
        id: "product-listing",
        name: "Product Listing & Description",
        description: "Create and maintain product descriptions, images, pricing",
        importance: "core",
        keywords: ["product", "listing", "description", "catalog", "SKU"],
      },
      {
        id: "order-fulfillment",
        name: "Order Fulfilment",
        description: "Process orders, manage shipping, handle returns",
        importance: "core",
        keywords: ["order", "fulfillment", "shipping", "delivery", "return"],
      },
      {
        id: "customer-support",
        name: "Customer Support",
        description: "Handle enquiries, complaints, returns, refunds",
        importance: "core",
        keywords: ["support", "customer", "enquiry", "complaint", "refund"],
      },
      {
        id: "inventory-management",
        name: "Inventory Management",
        description: "Track stock levels, reorder points, supplier management",
        importance: "core",
        keywords: ["inventory", "stock", "reorder", "warehouse", "supply"],
      },
      {
        id: "marketing-content",
        name: "Marketing & Content",
        description: "Create marketing content, manage campaigns, social media",
        importance: "common",
        keywords: ["marketing", "content", "campaign", "social", "email"],
      },
      {
        id: "pricing-strategy",
        name: "Pricing & Promotions",
        description: "Manage pricing strategy, discounts, seasonal promotions",
        importance: "common",
        keywords: ["pricing", "discount", "promotion", "sale", "margin"],
      },
    ],
  },
  {
    id: "content-creative",
    name: "Content & Creative",
    matchKeywords: [
      "content", "creative", "agency", "design", "media", "marketing",
      "brand", "copywriting", "video", "photography", "podcast",
      "publishing", "writer", "freelance",
    ],
    patterns: [
      {
        id: "content-creation",
        name: "Content Creation Pipeline",
        description: "Ideation, drafting, review, publish — end-to-end content production",
        importance: "core",
        keywords: ["content", "create", "draft", "publish", "write"],
      },
      {
        id: "content-review",
        name: "Content Review & Approval",
        description: "Multi-stage review: editorial, brand, legal, client sign-off",
        importance: "core",
        keywords: ["review", "approval", "editorial", "sign-off", "feedback"],
      },
      {
        id: "content-calendar",
        name: "Content Calendar & Planning",
        description: "Plan content schedule, manage editorial calendar, coordinate releases",
        importance: "core",
        keywords: ["calendar", "schedule", "plan", "editorial", "release"],
      },
      {
        id: "client-briefs",
        name: "Client Brief Management",
        description: "Receive briefs, clarify requirements, manage revisions",
        importance: "common",
        keywords: ["brief", "client", "requirements", "revision", "scope"],
      },
      {
        id: "asset-management",
        name: "Asset Library",
        description: "Organise creative assets, manage brand guidelines, version control",
        importance: "common",
        keywords: ["asset", "library", "brand", "guideline", "template"],
      },
    ],
  },
  {
    id: "healthcare-clinical",
    name: "Healthcare & Clinical",
    matchKeywords: [
      "healthcare", "clinical", "medical", "health", "patient", "therapy",
      "counselling", "psychology", "clinic", "practice", "doctor",
      "nurse", "physio", "physiotherapy", "dental", "dentist",
    ],
    patterns: [
      {
        id: "patient-intake",
        name: "Patient Intake & Assessment",
        description: "Initial assessment, history gathering, consent forms",
        importance: "core",
        keywords: ["intake", "assessment", "patient", "history", "consent"],
      },
      {
        id: "treatment-planning",
        name: "Treatment Planning",
        description: "Develop and document treatment plans with goals and milestones",
        importance: "core",
        keywords: ["treatment", "plan", "goal", "care", "protocol"],
      },
      {
        id: "clinical-notes",
        name: "Clinical Documentation",
        description: "Session notes, progress notes, discharge summaries",
        importance: "core",
        keywords: ["notes", "documentation", "progress", "session", "record"],
      },
      {
        id: "referrals",
        name: "Referral Management",
        description: "Manage incoming and outgoing referrals, follow-up on outcomes",
        importance: "common",
        keywords: ["referral", "refer", "specialist", "follow-up"],
      },
      {
        id: "compliance-clinical",
        name: "Clinical Compliance",
        description: "Track regulatory requirements, audits, accreditation",
        importance: "common",
        keywords: ["compliance", "regulatory", "audit", "accreditation", "standard"],
      },
    ],
  },
];

// ============================================================
// Matching
// ============================================================

/**
 * Match a business description or user model entries to the best industry profile.
 * Returns null if no confident match.
 */
export function matchIndustry(
  signals: string[],
): IndustryProfile | null {
  if (signals.length === 0) return null;

  const combined = signals.join(" ").toLowerCase();

  let bestMatch: IndustryProfile | null = null;
  let bestScore = 0;

  for (const profile of INDUSTRY_PROFILES) {
    let score = 0;
    for (const keyword of profile.matchKeywords) {
      if (combined.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = profile;
    }
  }

  // Need at least 1 keyword match to be confident
  return bestScore >= 1 ? bestMatch : null;
}

/**
 * Find coverage gaps: industry patterns that the user doesn't have
 * a matching process for yet.
 */
export function findCoverageGaps(
  industry: IndustryProfile,
  existingProcesses: Array<{ name: string; description: string | null }>,
): ProcessPattern[] {
  const existingText = existingProcesses
    .map((p) => `${p.name} ${p.description ?? ""}`.toLowerCase())
    .join(" ");

  return industry.patterns.filter((pattern) => {
    // Check if any keyword from this pattern appears in existing processes
    const covered = pattern.keywords.some((kw) =>
      existingText.includes(kw.toLowerCase()),
    );
    return !covered;
  });
}
