import type { Metadata } from "next";
import { NetworkChatShell } from "./network-chat-shell";
import type { NetworkChatMode } from "./preview-pane";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Network Chat — Ditto",
  description: "Choose a side of the network and start the conversation.",
};

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

export default async function NetworkChatPage({ searchParams }: NetworkChatPageProps) {
  const params = await searchParams;
  const mode = normalizeMode(firstParam(params.mode));

  return <NetworkChatShell initialMode={mode} />;
}
