import { randomBytes } from "node:crypto";

// Google Calendar event IDs: base32hex characters only (lowercase a-v and digits 0-9),
// length 5-1024. Note: "x" is NOT base32hex, so the separator between configId and
// sourceId is "s", which never occurs in a configId (hex, 0-9a-f).
export const EVENT_ID_RE = /^[a-v0-9]{5,1024}$/;
export const CONFIG_ID_RE = /^[0-9a-f]{8}$/;

export function newConfigId(): string {
  return randomBytes(4).toString("hex");
}

function encodeSourceId(sourceId: string): string {
  if (/^[0-9a-v]+$/.test(sourceId)) return sourceId;
  // Unexpected characters: encode as hex, which is base32hex-safe. "h" marks the encoding.
  return `h${Buffer.from(sourceId, "utf8").toString("hex")}`;
}

/** Deterministic event ID: "unibg" + configId + "s" + sourceId, e.g. "unibg0a1b2c3ds919167". */
export function googleEventId(configId: string, sourceId: string): string {
  if (!CONFIG_ID_RE.test(configId)) throw new Error(`configId non valido: ${configId}`);
  const id = `unibg${configId}s${encodeSourceId(sourceId)}`;
  if (!EVENT_ID_RE.test(id)) throw new Error(`ID evento non valido: ${id}`);
  return id;
}
