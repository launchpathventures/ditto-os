import type { Metadata } from "next";
import { NetworkChatShell } from "./network-chat-shell";
import type { NetworkChatMode } from "./preview-pane";
import {
  isNetworkEntryIntent,
  type NetworkEntryIntent,
} from "@/lib/network-entry-intent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Network Chat — Ditto",
  description: "Choose how Ditto should help and start the conversation.",
};

export type { NetworkEntryIntent };

interface NetworkChatPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeMode(value: string | null): NetworkChatMode {
  return value === "client" ? "client" : "expert";
}

// Returns the canonical intent only when the URL carries an explicit, valid intent.
// Mode-toggle navigations omit intent — those must NOT fire `network_entry_selected`.
function normalizeIntent(value: string | null): NetworkEntryIntent | undefined {
  return isNetworkEntryIntent(value) ? value : undefined;
}

function normalizeInitialAnswer(value: string | null): string | undefined {
  const answer = value?.trim();
  return answer ? answer.slice(0, 700) : undefined;
}

export default async function NetworkChatPage({ searchParams }: NetworkChatPageProps) {
  const params = await searchParams;
  const mode = normalizeMode(firstParam(params.mode));
  const intent = normalizeIntent(firstParam(params.intent));
  const initialAnswer = normalizeInitialAnswer(firstParam(params.seed));

  return <NetworkChatShell initialMode={mode} initialIntent={intent} initialAnswer={initialAnswer} />;
}
