import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyWebhook, WebhookDeduper } from "../src/webhook.ts";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const body = JSON.stringify({ type: "ContactCreate", webhookId: "w1" });
const sig = sign(null, Buffer.from(body), privateKey).toString("base64");

test("accepts a valid Ed25519 signature", () => {
  assert.equal(verifyWebhook(body, { "X-GHL-Signature": sig }, { ed25519PublicKey: pem }), true);
});
test("rejects a tampered body", () => {
  assert.equal(verifyWebhook(body + " ", { "x-ghl-signature": sig }, { ed25519PublicKey: pem }), false);
});
test("rejects missing and N/A signatures", () => {
  assert.equal(verifyWebhook(body, {}, { ed25519PublicKey: pem }), false);
  assert.equal(verifyWebhook(body, { "x-ghl-signature": "N/A" }, { ed25519PublicKey: pem }), false);
});
test("rejects garbage signature without throwing", () => {
  assert.equal(verifyWebhook(body, { "x-ghl-signature": "!!!" }, { ed25519PublicKey: pem }), false);
});
test("deduper allows first, blocks repeat, expires", () => {
  const d = new WebhookDeduper(1000);
  assert.equal(d.firstTime("a", 0), true);
  assert.equal(d.firstTime("a", 500), false);
  assert.equal(d.firstTime("a", 2000), true);
});
