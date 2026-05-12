/**
 * Ditto Web — Network API Availability Helper (Brief 263 AC #6)
 *
 * When a route hits a network DB connection failure (`SUPABASE_DB_URL`
 * missing, postgres-js TCP failure, pool closed), surface a structured
 * 503 to the caller instead of leaking a 500. The detection lives in
 * `src/db/network-db.ts`; this module owns the `NextResponse` shape used
 * by the API routes.
 *
 * Two usage patterns:
 *
 *   1. Wrap the whole handler when no other error handling exists:
 *
 *        export const GET = withNetworkAvailability(async (req) => { ... });
 *
 *   2. In a route that already has its own try/catch, branch inside the
 *      catch on `isNetworkDbConnectionError` and return
 *      `networkUnavailableResponse()` before the generic 500 fallback.
 *
 * Both patterns are valid; pick whichever yields the smallest diff.
 */

import { NextResponse } from "next/server";
import {
  isNetworkDbConnectionError,
  withNetworkDbAvailability,
} from "../../../src/db/network-db";

export { isNetworkDbConnectionError };

const UNAVAILABLE_BODY = {
  error: "network_db_unavailable",
  message:
    "The network tier is temporarily unavailable. Please retry in a moment.",
} as const;

export function networkUnavailableResponse(): NextResponse {
  return NextResponse.json(UNAVAILABLE_BODY, { status: 503 });
}

export function withNetworkAvailability<
  Args extends unknown[],
  R extends Response,
>(
  handler: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<Response> {
  return withNetworkDbAvailability<Args, R>(handler);
}
