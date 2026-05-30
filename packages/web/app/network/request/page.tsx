import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { verifyRefTokenForHost } from "@/lib/signed-cookie";
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
  const dittoRef = firstParam(params.ditto_ref);
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (dittoRef && !(await verifyRefTokenForHost(dittoRef, host))) {
    notFound();
  }
  const initialNeed = normalizeInitialNeed(firstParam(params.seed));

  return <RequestWorkspace initialNeed={initialNeed} />;
}
