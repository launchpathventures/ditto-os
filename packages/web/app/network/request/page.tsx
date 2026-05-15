import type { Metadata } from "next";
import { RequestWorkspace } from "./request-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research People and Companies — Ditto Network",
  description: "Turn a people or company research question into a source-backed request.",
};

interface NetworkRequestPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeInitialNeed(value: string | null): string | undefined {
  const need = value?.trim();
  return need ? need.slice(0, 700) : undefined;
}

export default async function NetworkRequestPage({ searchParams }: NetworkRequestPageProps) {
  const params = await searchParams;
  const initialNeed = normalizeInitialNeed(firstParam(params.seed));

  return <RequestWorkspace initialNeed={initialNeed} />;
}
