"use client";

import { useEffect, useState } from "react";
import { DiscoveryCandidateQueue } from "@/components/admin/discovery-candidate-queue";

const TOKEN_KEY = "ditto-admin-token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export default function NetworkDiscoveryAdminPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(readToken());
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <DiscoveryCandidateQueue token={token} />
    </main>
  );
}
