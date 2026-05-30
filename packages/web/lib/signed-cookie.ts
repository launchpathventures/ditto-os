export const SHARE_REF_COOKIE = "ditto_share_ref";
export const REF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface ShareRefPayload {
  channel: string;
  ph: string;
  ts: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET || process.env.NETWORK_AUTH_SECRET;
  if (!value) throw new Error("signed cookie secret is not configured");
  return value;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function safePart(value: string, label: string): string {
  const clean = value.trim();
  if (!clean || clean.includes("|")) {
    throw new Error(`invalid ${label}`);
  }
  return clean;
}

function isExpired(ts: number, now = Date.now()): boolean {
  return !Number.isFinite(ts) || ts <= 0 || now - ts > REF_TOKEN_TTL_MS;
}

export async function signValue(payload: string): Promise<string> {
  const clean = safePart(payload, "payload");
  return `${clean}|${await hmac(clean)}`;
}

export async function verifyValue(signed: string): Promise<string | null> {
  const sepIdx = signed.lastIndexOf("|");
  if (sepIdx === -1) return null;
  const payload = signed.slice(0, sepIdx);
  const sig = signed.slice(sepIdx + 1);
  if (!payload || !sig) return null;
  return sig === await hmac(payload) ? payload : null;
}

export async function signRefToken(input: ShareRefPayload): Promise<string> {
  const channel = safePart(input.channel, "channel");
  const ph = safePart(input.ph, "profile handle");
  const ts = Math.trunc(input.ts);
  if (!Number.isFinite(ts) || ts <= 0) throw new Error("invalid timestamp");
  const payload = `${channel}|${ph}|${ts}`;
  return `${payload}|${await hmac(payload)}`;
}

export async function verifyRefToken(
  token: string,
  opts: { now?: number } = {},
): Promise<ShareRefPayload | null> {
  const parts = token.split("|");
  if (parts.length !== 4) return null;
  const [channel, ph, tsRaw, sig] = parts;
  if (!channel || !ph || !tsRaw || !sig) return null;
  const ts = Number(tsRaw);
  if (isExpired(ts, opts.now ?? Date.now())) return null;
  const payload = `${channel}|${ph}|${tsRaw}`;
  if (sig !== await hmac(payload)) return null;
  return { channel, ph, ts };
}

export function handleFromDittoYouHost(host: string | null | undefined): string | null {
  const hostname = (host ?? "").split(":")[0]?.trim().toLowerCase();
  const suffix = ".ditto.you";
  if (!hostname?.endsWith(suffix)) return null;
  const handle = hostname.slice(0, -suffix.length);
  return handle && !handle.includes(".") ? handle : null;
}

export function refPayloadMatchesHost(
  payload: ShareRefPayload,
  host: string | null | undefined,
): boolean {
  const handle = handleFromDittoYouHost(host);
  return Boolean(handle && handle === payload.ph);
}

export async function verifyRefTokenForHost(
  token: string,
  host: string | null | undefined,
  opts: { now?: number } = {},
): Promise<ShareRefPayload | null> {
  const payload = await verifyRefToken(token, opts);
  if (!payload || !refPayloadMatchesHost(payload, host)) return null;
  return payload;
}
