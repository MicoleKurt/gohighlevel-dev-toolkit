# GoHighLevel Dev Toolkit

Research notes and a small, tested TypeScript toolkit for building AI agents, automations and integrations on **GoHighLevel (HighLevel) API v2**.

> Status: the code is unit-tested (9 tests: webhook signatures, retry, rate limiting) and type-checks clean. It has **not** been run against a live HighLevel account. Endpoint paths and field names follow the public docs; confirm them per endpoint (see "Verify before you ship").

## What is in here

| Path | What it does |
|---|---|
| `src/client.ts` | Fetch client: Bearer token, `Version` header, retry with backoff on 429/5xx (honours `Retry-After`), typed `GhlError` |
| `src/rate-limiter.ts` | Sliding-window limiter, default 90 requests per 10 s (documented burst limit is 100 per 10 s) |
| `src/webhook.ts` | Ed25519 `X-GHL-Signature` verification on the raw body, optional legacy RSA fallback, `webhookId` de-duplication |
| `examples/nextjs-webhook-route.ts` | Next.js App Router webhook route: raw body, verify, dedupe, ack fast, work off the request path |
| `examples/claude-reply-agent.ts` | Inbound message → Claude reply grounded in business facts → sent through HighLevel, with a `HANDOFF` path to a human |
| `test/` | `node:test` suites |

```bash
npm install
npm test
npm run typecheck
```

## Research notes (as of 2026-10-13)

### Authentication
- Use a **Private Integration Token (PIT)** for your own sub-account or agency: generated in the HighLevel UI, scoped, sent as `Authorization: Bearer pit_…`. PITs do not auto-refresh; rotate manually. Do not reuse sandbox PITs in production.
- Use **OAuth** (Marketplace app) when other businesses install your integration.
- Base URL: `https://services.leadconnectorhq.com`. Send a date-based `Version` header on every call; a missing header is a reported cause of 401s. `2021-07-28` is the common value, but some endpoints document others (for example `2023-02-21`), so check each endpoint's page. The client takes `version` as an option.
- API v1 reached end-of-support on 2025-12-31. Build on v2 only.

### Limits
- Burst limit: 100 requests per 10 seconds (consistent across sources). Daily limit reported as 200,000 requests per resource; whether that is per app or per location differs between sources, so confirm on the official rate-limit page. Batch and cache.

### Webhooks (what actually bites)
- Verify `X-GHL-Signature` (Ed25519) using the key published in the Webhook Integration Guide. The legacy `X-WH-Signature` (RSA-SHA256) is documented as deprecated on 2026-09-01.
- The docs do not state exactly which bytes are signed. Their sample signs the body; verify against the **raw** request body and test with a real delivery before trusting it in production. This is why the route reads `req.text()` before parsing.
- Retries: any non-2xx or timeout is retried, up to 12 times with exponential backoff and jitter. A 2xx stops retries. Therefore: acknowledge fast, make handlers idempotent, de-duplicate on `webhookId`.
- No documented replay window or signature timestamp header; the payload carries `timestamp` and `webhookId`.

### Tools worth using
- **Official HighLevel MCP server** (hosted at `services.leadconnectorhq.com/mcp/`, OAuth or PIT, one sub-account per connection). Reported to expose 550+ operations through a small `search_operations` / `describe_operation` / `execute_operation` surface. Start with view scopes, add edit scopes after you have watched it behave. Check the official docs for current endpoint URLs.
- **Community MCP servers** (self-hosted, wider tool coverage, you own the credential security). Treat as unreviewed code.
- **Claude / OpenAI APIs** for the reasoning step; keep the model out of the request path of webhooks.
- **Next.js + Supabase + Vercel** for the custom layer around HighLevel: webhook receiver, queue table, dashboards, client portals.

### Senior-developer rules for HighLevel builds
1. Verify every webhook; ack in under a second; process asynchronously.
2. Idempotency everywhere: dedupe on `webhookId`, upsert contacts rather than create.
3. Respect the limiter; never fan out unbounded `Promise.all` against the API.
4. Scope tokens to the minimum; one token per integration; secrets only in env.
5. Ground LLM replies in supplied business facts and give them a human-handoff exit.
6. Log every outbound API call with its request id so a client's "it didn't send" is answerable.
7. Dry-run first for any bulk write.

## Verify before you ship
- Endpoint paths and bodies in `GhlClient` helpers (`/contacts/upsert`, `/conversations/messages`, `/opportunities/`) against the current API reference.
- The `Version` value for each endpoint you call.
- Webhook signing input against a real delivery in your sub-account.
- Rate-limit scope in the official Marketplace docs.

## Sources
- HighLevel Webhook Integration Guide: https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide
- HighLevel Private Integration Tokens (sandbox guide): https://marketplace.gohighlevel.com/docs/oauth/SandboxPIT
- Third-party summaries of API limits, Version header and MCP (not authoritative; verify against the official docs): ecosire.com, supergood.ai API report card, revenuegeeks.com, glama.ai MCP directory.

## License
MIT
