// app/api/ghl/webhook/route.ts  (Next.js App Router)
// Copy src/webhook.ts into your app and adjust the import path.
import { verifyWebhook, WebhookDeduper } from "@/lib/ghl/webhook";

const dedupe = new WebhookDeduper();

export async function POST(req: Request) {
  const raw = await req.text(); // raw body first, parse after verifying
  const headers = Object.fromEntries(req.headers);

  if (!verifyWebhook(raw, headers)) return new Response("invalid signature", { status: 401 });

  const event = JSON.parse(raw) as { type?: string; webhookId?: string };
  if (event.webhookId && !dedupe.firstTime(event.webhookId)) {
    return new Response("duplicate", { status: 200 }); // 2xx stops retries
  }

  // Acknowledge fast; push slow work (LLM calls, CRM writes) to a queue or background job.
  queueMicrotask(() => void handle(event));
  return new Response("ok", { status: 200 });
}

async function handle(event: { type?: string }) {
  console.log("GHL event", event.type);
}
