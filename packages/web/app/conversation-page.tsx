"use client";

import { Conversation } from "@/components/self/conversation";

/**
 * Full-screen conversation layout.
 *
 * The Self is the primary surface. No sidebar, no feed, no workspace chrome.
 * This is what new users see on day 1.
 *
 * AC9: New user → full-screen conversation.
 * AC50: Default to conversation-only layout for new users.
 */

interface ConversationPageProps {
  userId: string;
}

export function ConversationPage({ userId }: ConversationPageProps) {
  return (
    <main className="h-screen flex flex-col bg-background">
      <Conversation userId={userId} />
    </main>
  );
}
