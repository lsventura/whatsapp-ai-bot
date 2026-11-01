import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDemoFormRouter } from "../src/demoForm.js";
import { createServer } from "../src/server.js";
import { createLogger } from "../src/util/logger.js";
import { signBody } from "../src/whatsapp/signature.js";
import { makeBot } from "./helpers.js";

const SECRET = "app-secret-teste";
let server: Server;
let base: string;
let ctx: ReturnType<typeof makeBot>;
let demo: ReturnType<typeof createDemoFormRouter>;

beforeEach(async () => {
  ctx = makeBot();
  demo = createDemoFormRouter();
  const app = createServer({
    bot: ctx.bot,
    logger: createLogger("silent"),
    verifyToken: "meu-token",
    appSecret: SECRET,
    extraRouters: [demo.router],
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const payload = (id: string, text: string) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: "5511999998888", profile: { name: "Maria" } }],
              messages: [{ id, from: "5511999998888", type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  });

const post = (body: string, signature?: string) =>
  fetch(`${base}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(signature ? { "x-hub-signature-256": signature } : {}) },
    body,
  });

describe("servidor / webhook", () => {
  it("GET /health", async () => {
    const res = await fetch(`${base}/health`);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("verificação do webhook devolve o challenge com o token certo", async () => {
    const ok = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=meu-token&hub.challenge=12345`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");

    const bad = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`);
    expect(bad.status).toBe(403);
  });

  it("rejeita POST sem assinatura válida", async () => {
    expect((await post(payload("w1", "oi"))).status).toBe(401);
    expect((await post(payload("w1", "oi"), "sha256=00")).status).toBe(401);
    expect(ctx.sender.sent).toHaveLength(0);
  });

  it("aceita POST assinado, responde 200 e processa a mensagem", async () => {
    const body = payload("w2", "qual o horário de funcionamento?");
    const res = await post(body, signBody(body, SECRET));
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.sender.to("5511999998888")[0]).toContain("segunda a sexta");
  });
});

describe("formulário demo", () => {
  it("serve a página e registra envios com protocolo", async () => {
    const page = await fetch(`${base}/demo-form`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Agendamento de consulta");

    const res = await fetch(`${base}/demo-form/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome: "Maria", email: "m@e.com", telefone: "11999998888", servico: "limpeza", data: "2099-01-01" }),
    });
    expect(res.status).toBe(201);
    const { protocolo } = (await res.json()) as { protocolo: string };
    expect(protocolo).toMatch(/^AGD-[0-9A-F]{8}$/);
    expect(demo.submissions[0]?.data.nome).toBe("Maria");
  });

  it("valida campos obrigatórios", async () => {
    const res = await fetch(`${base}/demo-form/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome: "Maria" }),
    });
    expect(res.status).toBe(400);
  });
});
