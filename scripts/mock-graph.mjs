#!/usr/bin/env node
// Graph API falsa para teste local: imprime o que o bot enviaria para POST /{versao}/{phone-id}/messages.
// Uso: node scripts/mock-graph.mjs [porta=4010]  e rode o bot com WHATSAPP_API_BASE_URL=http://localhost:4010
import { createServer } from "node:http";
const port = Number(process.argv[2] ?? 4010);
createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const auth = req.headers.authorization?.startsWith("Bearer ") ? "Bearer ok" : "SEM TOKEN";
    let shown = body;
    try { const j = JSON.parse(body); shown = j.text ? `to=${j.to} text=${JSON.stringify(j.text.body)}` : `status=${j.status}`; } catch { /* corpo não é JSON: mostra cru */ }
    console.log(`${req.method} ${req.url} [${auth}] ${shown}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid.mock" }], success: true }));
  });
}).listen(port, () => console.log(`mock Graph API em http://localhost:${port}`));
