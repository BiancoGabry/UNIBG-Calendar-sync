import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearFailures,
  configuredPassword,
  isBcryptHash,
  isLocked,
  recordFailure,
  verifyPassword,
} from "@/lib/auth/password";
import { createSessionToken, safeNext, verifySessionToken } from "@/lib/auth/session";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("password", () => {
  it("accepts a plain APP_PASSWORD (hashed with bcrypt in memory)", async () => {
    process.env.APP_PASSWORD = "correct horse battery";
    expect(await verifyPassword("correct horse battery")).toBe(true);
    expect(await verifyPassword("wrong")).toBe(false);
    expect(await verifyPassword("")).toBe(false);
  });

  it("accepts a bcrypt hash as APP_PASSWORD", async () => {
    const hash = await bcrypt.hash("s3gret0-lungo", 4);
    expect(isBcryptHash(hash)).toBe(true);
    process.env.APP_PASSWORD = hash;
    expect(await verifyPassword("s3gret0-lungo")).toBe(true);
    expect(await verifyPassword(hash)).toBe(false); // the hash itself is not the password
  });

  it("unescapes a hash written as \\$2b\\$… (Next.js .env syntax)", () => {
    const hash = "$2b$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234";
    expect(configuredPassword(hash.replace(/\$/g, "\\$"))).toBe(hash);
    expect(configuredPassword("pass\\$word")).toBe("pass\\$word"); // plain passwords untouched
  });

  it("locks an IP after 5 failures and everyone after 20", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) recordFailure("1.1.1.1", t);
    expect(isLocked("1.1.1.1", t)).toBe(true);
    expect(isLocked("2.2.2.2", t)).toBe(false);
    expect(isLocked("1.1.1.1", t + 16 * 60_000)).toBe(false); // window over
    clearFailures("1.1.1.1");
    for (let i = 0; i < 20; i++) recordFailure(`10.0.0.${i}`, t);
    expect(isLocked("9.9.9.9", t)).toBe(true);
    expect(isLocked("9.9.9.9", t + 16 * 60_000)).toBe(false);
  });
});

describe("session", () => {
  it("is valid until APP_PASSWORD changes", async () => {
    process.env.SESSION_SECRET = "x".repeat(40);
    process.env.APP_PASSWORD = "prima-password";
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toEqual({ user: "owner" });
    process.env.APP_PASSWORD = "seconda-password";
    expect(await verifySessionToken(token)).toBeNull();
    expect(await verifySessionToken("garbage")).toBeNull();
  });

  it("only redirects inside the app", () => {
    expect(safeNext("/configs/1")).toBe("/configs/1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
