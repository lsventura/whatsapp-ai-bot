#!/usr/bin/env node
// Simula a Meta chamando o webhook local: verificação GET (hub.challenge) e POST assinado (X-Hub-Signature-256).
// Uso: node scripts/simular-meta.mjs "oi" [numero_do_contato] [url_base]
// Lê WHATSAPP_VERIFY_TOKEN e WHATSAPP_APP_SECRET do .env. Não imprime segredos.
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const text = process.argv[2] ?? "oi";
const from = process.argv[3] ?? "551199990000";
const base = process.argv[4] ?? `http://localhost:${process.env.PORT ?? 3000}`;
const verify = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
const secret = process.env.WHATSAPP_APP_SECRET ?? "";

const challenge = String(Math.floor(Math.random() * 1e9));
const g = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verify)}&hub.challenge=${challenge}`);
const gBody = await g.text();
console.log(`GET /webhook -> ${g.status} ${gBody === challenge ? "(challenge ok)" : "(challenge ERRADO)"}`);

const payload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA_ID", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "15550000000", phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || "PHONE_ID" },
    contacts: [{ profile: { name: "Teste" }, wa_id: from }],
    messages: [{ from, id: `wamid.sim${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
  } }] }],
});
const headers = { "content-type": "application/json" };
if (secret) headers["x-hub-signature-256"] = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
const p = await fetch(`${base}/webhook`, { method: "POST", headers, body: payload });
console.log(`POST /webhook (${secret ? "assinado" : "SEM assinatura"}) -> ${p.status}`);
const bad = await fetch(`${base}/webhook`, { method: "POST", headers: { ...headers, "x-hub-signature-256": "sha256=00" }, body: payload });
console.log(`POST /webhook com assinatura falsa -> ${bad.status} ${secret ? (bad.status === 401 ? "(rejeitou, ok)" : "(DEVIA ser 401)") : "(sem APP_SECRET não valida)"}`);
