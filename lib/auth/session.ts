// Signed session cookie (HS256 JWT). The token carries a fingerprint of APP_PASSWORD:
// changing the password logs every browser out. Web Crypto only, so it also runs in proxy.ts.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "unibg_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 3600;

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET mancante o troppo corta");
  return new TextEncoder().encode(secret);
}

async function passwordFingerprint(): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(process.env.APP_PASSWORD ?? ""));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ pv: await passwordFingerprint() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(key());
}

export async function verifySessionToken(token: string | undefined): Promise<{ user: "owner" } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], subject: "owner" });
    return payload.pv === (await passwordFingerprint()) ? { user: "owner" } : null;
  } catch {
    return null;
  }
}

/** Only relative paths inside the app ("/x", not "//host" or "/\host"). */
export function safeNext(value: unknown): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/";
}
