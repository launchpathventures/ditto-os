/**
 * Ditto — Direct URL Fetch
 *
 * Fetches a URL and extracts readable text content.
 * Used when visitors share their website, portfolio, or other links
 * during front-door conversations.
 *
 * Provenance: Brief 093 (front door intelligence).
 */

import { lookup } from "dns/promises";

/**
 * Result of a URL fetch — either content or a descriptive error.
 * Errors are fed back to the LLM so Alex can tell the user what happened.
 */
export interface FetchResult {
  content: string | null;
  error: string | null;
}

// Private/internal IP ranges that must never be fetched (SSRF protection)
const BLOCKED_IP_RANGES = [
  /^127\./, // loopback
  /^10\./, // RFC-1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC-1918
  /^192\.168\./, // RFC-1918
  /^169\.254\./, // link-local
  /^0\./, // "this" network
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 unique local
  /^fe80:/i, // IPv6 link-local
];

function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_RANGES.some((re) => re.test(ip));
}

// Content types we can meaningfully extract text from
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
  "application/xhtml",
];

function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.split(";")[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.some((allowed) => ct === allowed);
}

// Minimum chars for content to be considered useful (filters out SPA shells)
const MIN_CONTENT_LENGTH = 80;

/**
 * Fetch a URL and return its text content, stripped of HTML.
 * Returns a FetchResult with either content or a descriptive error.
 */
export async function fetchUrlContent(url: string, _redirectDepth = 0): Promise<FetchResult> {
  // Guard against infinite redirect loops
  if (_redirectDepth > 5) {
    return { content: null, error: `The page at ${url} redirected too many times.` };
  }
  // Normalize URL — add https:// if no protocol
  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  // Block non-HTTP schemes
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return { content: null, error: `Unsupported URL scheme: ${url}` };
  }

  // SSRF protection: resolve hostname and check against blocked ranges.
  // We do NOT pin the resolved IP in the URL because rewriting the hostname
  // breaks TLS/SNI (cert is for the domain, not the IP). The TOCTOU window
  // between this check and the fetch is negligible for a chat feature.
  try {
    const parsedUrl = new URL(normalizedUrl);
    const hostname = parsedUrl.hostname;
    // Block localhost variants
    if (hostname === "localhost" || hostname === "[::1]") {
      console.warn(`[web-fetch] Blocked internal URL: ${normalizedUrl}`);
      return { content: null, error: null }; // Silent — don't tell the LLM about internal URLs
    }
    const { address } = await lookup(hostname);
    if (isBlockedIp(address)) {
      console.warn(`[web-fetch] Blocked internal IP ${address} for ${normalizedUrl}`);
      return { content: null, error: null };
    }
  } catch {
    return { content: null, error: `Could not resolve ${url} — the domain may not exist.` };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      redirect: "manual",
    });

    clearTimeout(timeout);

    // Handle redirects manually — validate each target against SSRF blocklist
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { content: null, error: `The page at ${url} redirected without a target.` };
      }
      // Resolve relative redirects against the original URL
      const redirectUrl = new URL(location, normalizedUrl).toString();
      // Validate the redirect target — recurse with the validated URL
      return fetchUrlContent(redirectUrl, _redirectDepth + 1);
    }

    if (!response.ok) {
      console.warn(`[web-fetch] ${normalizedUrl} returned ${response.status}`);
      return {
        content: null,
        error: `The page at ${url} returned HTTP ${response.status}${response.status === 404 ? " (not found)" : ""}.`,
      };
    }

    // Validate content type — reject PDFs, images, binaries
    const contentType = response.headers.get("content-type");
    if (!isAllowedContentType(contentType)) {
      console.warn(`[web-fetch] ${normalizedUrl} returned unsupported content-type: ${contentType}`);
      return {
        content: null,
        error: `The page at ${url} returned ${contentType || "unknown content"} — I can only read HTML pages.`,
      };
    }

    const html = await response.text();
    const text = stripHtml(html);

    // Filter SPA shells and near-empty pages
    if (text.length < MIN_CONTENT_LENGTH) {
      console.warn(`[web-fetch] ${normalizedUrl} — only ${text.length} chars after stripping (likely SPA or empty)`);
      return {
        content: null,
        error: `The page at ${url} didn't have readable content — it might use JavaScript rendering that I can't process.`,
      };
    }

    // Truncate to keep context window reasonable
    const truncated = text.slice(0, 3000);
    console.log(`[web-fetch] ${normalizedUrl} — ${truncated.length} chars extracted`);
    return { content: truncated, error: null };
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[web-fetch] Error:", msg);
    if (msg.includes("abort")) {
      return { content: null, error: `The page at ${url} took too long to load.` };
    }
    return { content: null, error: `Couldn't reach ${url} — the site may be down.` };
  }
}

/**
 * Strip HTML tags, decode entities, and collapse whitespace.
 */
function stripHtml(html: string): string {
  return (
    html
      // Remove script and style blocks entirely
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, "")
      // Replace block-level tags with newlines
      .replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, "\n")
      .replace(/<(br|hr)[^>]*\/?>/gi, "\n")
      // Remove all remaining tags
      .replace(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&mdash;/g, "—")
      .replace(/&ndash;/g, "–")
      .replace(/&hellip;/g, "…")
      .replace(/&rsquo;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&rdquo;/g, "\u201D")
      .replace(/&ldquo;/g, "\u201C")
      // Decode numeric entities
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      // Collapse whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
