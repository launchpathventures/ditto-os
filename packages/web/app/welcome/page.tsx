import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { verifyRefTokenForHost } from "@/lib/signed-cookie";
import { DittoConversation } from "./ditto-conversation";

export const metadata: Metadata = {
  title: "Ditto — Tell Alex What You Do. He Handles the Rest.",
  description:
    "Alex finds your clients, makes introductions, and handles follow-ups. You approve everything at first. He earns your trust over time.",
};

interface WelcomePageProps {
  searchParams?: Promise<{ ditto_ref?: string | string[] }>;
}

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const dittoRef = firstParam(params?.ditto_ref);
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (dittoRef && !(await verifyRefTokenForHost(dittoRef, host))) {
    notFound();
  }
  return <DittoConversation />;
}
