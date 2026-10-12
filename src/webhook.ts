import { createPublicKey, createVerify, verify } from "node:crypto";

/** Ed25519 key published in HighLevel's Webhook Integration Guide (X-GHL-Signature). */
export const GHL_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

export interface VerifyOptions {
  /** Override for tests. */
  ed25519PublicKey?: string;
  /** Legacy RSA key (X-WH-Signature, deprecated 2026-09-01 per the guide). Optional. */
  legacyRsaPublicKey?: string;
}

type Headers = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Verify a HighLevel webhook. Pass the RAW request body string, before any
 * JSON.parse: re-serialising can change bytes and break the signature.
 */
export function verifyWebhook(rawBody: string, headers: Headers, opts: VerifyOptions = {}): boolean {
  const lower: Headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const ghlSig = first(lower["x-ghl-signature"]);
  const legacySig = first(lower["x-wh-signature"]);

  try {
    if (ghlSig && ghlSig !== "N/A") {
      return verify(
        null,
        Buffer.from(rawBody, "utf8"),
        createPublicKey(opts.ed25519PublicKey ?? GHL_ED25519_PUBLIC_KEY),
        Buffer.from(ghlSig, "base64"),
      );
    }
    if (legacySig && legacySig !== "N/A" && opts.legacyRsaPublicKey) {
      const v = createVerify("SHA256");
      v.update(rawBody);
      return v.verify(opts.legacyRsaPublicKey, legacySig, "base64");
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Retries happen on any non-2xx (up to 12 times), so handlers must be
 * idempotent. Dedupe on webhookId. Swap the Map for Redis/Postgres in prod.
 */
export class WebhookDeduper {
  private seen = new Map<string, number>();
  constructor(private readonly ttlMs = 24 * 60 * 60 * 1000) {}

  /** Returns true the first time an id is seen, false for repeats. */
  firstTime(webhookId: string, now = Date.now()): boolean {
    for (const [id, t] of this.seen) if (now - t > this.ttlMs) this.seen.delete(id);
    if (this.seen.has(webhookId)) return false;
    this.seen.set(webhookId, now);
    return true;
  }
}
