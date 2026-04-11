/**
 * Ditto — IP Geolocation
 *
 * Resolves visitor IP to approximate location (city, region, country).
 * Used to give Alex geographic context for searches and recommendations.
 * Falls back gracefully — location is always optional.
 *
 * Uses ip-api.com (free, no key required, 45 req/min).
 * Results are cached in-memory per IP hash to avoid repeated lookups.
 */

export interface GeoLocation {
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
}

// Simple in-memory cache — keyed by IP hash, expires after 1 hour
const cache = new Map<string, { location: GeoLocation; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Look up approximate location from an IP address.
 * Returns null if lookup fails or IP is local/private.
 */
export async function geolocateIp(ip: string, ipHash?: string): Promise<GeoLocation | null> {
  // Skip private/local IPs
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return null;
  }

  const cacheKey = ipHash || ip;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.location;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,country,timezone,status`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json() as {
      status: string;
      city?: string;
      regionName?: string;
      country?: string;
      timezone?: string;
    };

    if (data.status !== "success") return null;

    const location: GeoLocation = {
      city: data.city || undefined,
      region: data.regionName || undefined,
      country: data.country || undefined,
      timezone: data.timezone || undefined,
    };

    cache.set(cacheKey, { location, expiresAt: Date.now() + CACHE_TTL_MS });
    console.log(`[geo] ${cacheKey} → ${location.city}, ${location.region}, ${location.country}`);
    return location;
  } catch {
    // Geo lookup is non-critical — fail silently
    return null;
  }
}
