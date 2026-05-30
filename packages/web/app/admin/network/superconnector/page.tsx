"use client";

/**
 * Admin — Network Superconnector Health Dashboard (Brief 286)
 *
 * Extends the Brief 284 scaffold under the existing `/admin` shell. The layout
 * owns the deployment-mode notFound() gate; this page reuses the same
 * localStorage Bearer token convention as the rest of admin.
 */

import { useEffect, useState } from "react";
import { NetworkHealthDashboard } from "@/components/admin/network-health-dashboard";

const TOKEN_KEY = "ditto-admin-token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export default function SuperconnectorAdminPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(readToken());
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <NetworkHealthDashboard token={token} />
    </main>
  );
}
