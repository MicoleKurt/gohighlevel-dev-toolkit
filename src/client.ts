import { RateLimiter } from "./rate-limiter.ts";

export interface GhlClientOptions {
  /** Private Integration Token (or an OAuth access token). */
  token: string;
  baseUrl?: string;
  /** Date-based API version header. Check each endpoint's docs page. */
  version?: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
}

export class GhlError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Thin fetch wrapper: auth + Version headers, rate limiting, retry with backoff. */
export class GhlClient {
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;

  constructor(private readonly opts: GhlClientOptions) {
    this.baseUrl = opts.baseUrl ?? "https://services.leadconnectorhq.com";
    this.version = opts.version ?? "2021-07-28";
    this.maxRetries = opts.maxRetries ?? 4;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.limiter = opts.limiter ?? new RateLimiter();
  }

  async request<T = unknown>(
    method: string,
    path: string,
    init: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(init.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire();
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.opts.token}`,
          Version: this.version,
          Accept: "application/json",
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });

      if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

      if (RETRYABLE.has(res.status) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 500;
        await new Promise((r) => setTimeout(r, backoff + Math.random() * 250));
        continue;
      }

      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* keep text */
      }
      throw new GhlError(res.status, body, `GHL ${method} ${path} failed with ${res.status}`);
    }
  }

  // Thin helpers. Paths follow the public v2 docs; confirm field names per
  // endpoint before relying on them (see README "Verify before you ship").
  upsertContact(contact: Record<string, unknown> & { locationId: string }) {
    return this.request("POST", "/contacts/upsert", { body: contact });
  }

  sendMessage(msg: {
    type: "SMS" | "Email";
    contactId: string;
    message?: string;
    html?: string;
    subject?: string;
  }) {
    return this.request("POST", "/conversations/messages", { body: msg });
  }

  createOpportunity(opp: Record<string, unknown>) {
    return this.request("POST", "/opportunities/", { body: opp });
  }
}
