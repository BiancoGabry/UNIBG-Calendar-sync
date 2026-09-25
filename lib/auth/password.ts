// Single-password access. APP_PASSWORD may be plain text (hashed with bcrypt at first use,
// kept only in memory) or already a bcrypt hash. Comparison always goes through bcrypt.
import bcrypt from "bcryptjs";

const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const COST = 12;

export function isBcryptHash(value: string): boolean {
  return BCRYPT_HASH_RE.test(value);
}

let memo: { source: string; hash: Promise<string> } | null = null;

/** "\$2b\$12\$…" (hash escaped for Next's .env loader) → "$2b$12$…". */
export function configuredPassword(raw = process.env.APP_PASSWORD ?? ""): string {
  return /^\\\$2[aby]\\\$\d{2}\\\$/.test(raw) ? raw.replace(/\\\$/g, "$") : raw;
}

function configuredHash(): Promise<string> {
  const configured = configuredPassword();
  if (!configured) throw new Error("APP_PASSWORD non impostata");
  if (isBcryptHash(configured)) return Promise.resolve(configured);
  if (memo?.source !== configured) memo = { source: configured, hash: bcrypt.hash(configured, COST) };
  return memo.hash;
}

export async function verifyPassword(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  return bcrypt.compare(candidate, await configuredHash());
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

// --- brute-force guard (in memory) --------------------------------------------------
// Per client IP, plus a global cap: X-Forwarded-For can be forged when the app is exposed
// without a reverse proxy, the global cap still bounds guessing to ~80 tries per hour.

const WINDOW_MS = 15 * 60_000;
const MAX_PER_IP = 5;
const MAX_GLOBAL = 20;
const GLOBAL = "*";
const failures = new Map<string, { count: number; first: number }>();

function tooMany(key: string, max: number, now: number): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (now - f.first > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return f.count >= max;
}

export function isLocked(ip: string, now = Date.now()): boolean {
  return tooMany(ip, MAX_PER_IP, now) || tooMany(GLOBAL, MAX_GLOBAL, now);
}

export function recordFailure(ip: string, now = Date.now()): void {
  for (const key of [ip, GLOBAL]) {
    const f = failures.get(key);
    if (!f || now - f.first > WINDOW_MS) failures.set(key, { count: 1, first: now });
    else f.count++;
  }
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}
