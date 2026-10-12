// Inbound message -> Claude drafts a reply -> sent back through HighLevel.
// Run behind the webhook route. Keeps a human-handoff path for anything outside the facts.
import Anthropic from "@anthropic-ai/sdk";
import { GhlClient } from "../src/client.ts";

const ghl = new GhlClient({ token: process.env.GHL_TOKEN! });
const claude = new Anthropic(); // reads ANTHROPIC_API_KEY

export async function replyToInbound(contactId: string, inboundText: string, businessFacts: string) {
  const res = await claude.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 400,
    system:
      "You answer customer messages for a business. Use ONLY the facts provided. " +
      "If the answer is not in the facts, reply exactly: HANDOFF",
    messages: [{ role: "user", content: `Facts:\n${businessFacts}\n\nCustomer: ${inboundText}` }],
  });

  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (text === "HANDOFF") return { handedOff: true as const };

  await ghl.sendMessage({ type: "SMS", contactId, message: text });
  return { handedOff: false as const, text };
}
