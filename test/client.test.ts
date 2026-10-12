import test from "node:test";
import assert from "node:assert/strict";
import { GhlClient, GhlError } from "../src/client.ts";
import { RateLimiter } from "../src/rate-limiter.ts";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

test("sends Bearer + Version headers", async () => {
  let seen: Headers | undefined;
  const c = new GhlClient({
    token: "pit_x",
    fetchImpl: (async (_u: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return json(200, { ok: 1 });
    }) as typeof fetch,
  });
  await c.request("GET", "/contacts/1");
  assert.equal(seen?.get("authorization"), "Bearer pit_x");
  assert.equal(seen?.get("version"), "2021-07-28");
});

test("retries 429 then succeeds", async () => {
  let n = 0;
  const c = new GhlClient({
    token: "t",
    fetchImpl: (async () =>
      ++n < 2 ? json(429, {}, { "retry-after": "0" }) : json(200, { done: true })) as typeof fetch,
  });
  assert.deepEqual(await c.request("GET", "/x"), { done: true });
  assert.equal(n, 2);
});

test("throws GhlError on 401 without retrying", async () => {
  let n = 0;
  const c = new GhlClient({
    token: "t",
    fetchImpl: (async () => {
      n++;
      return json(401, { message: "bad" });
    }) as typeof fetch,
  });
  await assert.rejects(c.request("GET", "/x"), (e: unknown) => e instanceof GhlError && e.status === 401);
  assert.equal(n, 1);
});

test("rate limiter blocks the 3rd call inside the window", async () => {
  let t = 0;
  const slept: number[] = [];
  const rl = new RateLimiter(2, 1000, () => t, async (ms) => {
    slept.push(ms);
    t += ms;
  });
  await rl.acquire();
  await rl.acquire();
  await rl.acquire();
  assert.equal(slept.length, 1);
  assert.ok(slept[0] >= 1000);
});
