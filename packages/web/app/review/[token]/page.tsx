/**
 * Review Page (Brief 106)
 *
 * Server-side token validation via engine function directly,
 * renders ContentBlocks via existing block registry, embeds
 * chat component for user-Alex conversation.
 *
 * No sidebar, no workspace navigation, no process management.
 * Clean single-purpose review surface.
 */

import { ReviewPageClient } from "./review-page-client";

interface ReviewPageProps {
  params: Promise<{ token: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { token } = await params;

  // Validate token and load page data server-side (direct engine call, not API fetch)
  const { getReviewPage } = await import("@engine/review-pages");
  const page = await getReviewPage(token);

  if (!page) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">
          This link has expired or is invalid
        </h1>
        <p className="text-text-secondary">
          Review pages are available for a limited time. If you need to see this
          content again, ask Alex to send a new link.
        </p>
        <a
          href="/welcome"
          className="mt-4 rounded-lg bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          Talk to Alex
        </a>
      </div>
    );
  }

  return (
    <ReviewPageClient
      data={{
        id: page.id,
        title: page.title,
        contentBlocks: page.contentBlocks as Array<{ type: string; [key: string]: unknown }>,
        userName: page.userName,
        status: page.status,
      }}
      token={token}
    />
  );
}
