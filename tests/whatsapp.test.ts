import { describe, expect, it, vi } from "vitest";
import { CloudApiSender, normalizeBrMobile } from "../src/whatsapp/cloudApi.js";
import { parseWebhook } from "../src/whatsapp/parser.js";
import { signBody, verifySignature } from "../src/whatsapp/signature.js";

const payload = (messages: unknown[], extra: object = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ wa_id: "5511999998888", profile: { name: "Maria" } }],
            messages,
            ...extra,
          },
        },
      ],
    },
  ],
});

describe("parseWebhook", () => {
  it("extrai texto e nome do contato", () => {
    const result = parseWebhook(
      payload([{ id: "wamid.1", from: "5511999998888", type: "text", text: { body: "oi" } }]),
    );
    expect(result).toEqual([{ id: "wamid.1", from: "5511999998888", name: "Maria", type: "text", text: "oi" }]);
  });

  it("extrai resposta de botão e lista", () => {
    const result = parseWebhook(
      payload([
        { id: "1", from: "55", type: "interactive", interactive: { button_reply: { title: "Sim" } } },
        { id: "2", from: "55", type: "interactive", interactive: { list_reply: { title: "Opção B" } } },
      ]),
    );
    expect(result.map((m) => m.text)).toEqual(["Sim", "Opção B"]);
  });

  it("mídia vem sem texto", () => {
    const [msg] = parseWebhook(payload([{ id: "1", from: "55", type: "audio" }]));
    expect(msg).toMatchObject({ type: "audio", text: undefined });
  });

  it("ignora statuses e payloads de outros produtos", () => {
    expect(parseWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(parseWebhook({ object: "page" })).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
  });
});

describe("assinatura do webhook", () => {
  const secret = "segredo-de-teste";
  const body = Buffer.from('{"a":1}');

  it("aceita assinatura correta", () => {
    expect(verifySignature(body, signBody(body, secret), secret)).toBe(true);
  });

  it("rejeita assinatura errada, ausente ou malformada", () => {
    expect(verifySignature(body, signBody(body, "outro"), secret)).toBe(false);
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, "sha256=zz", secret)).toBe(false);
    expect(verifySignature(Buffer.from('{"a":2}'), signBody(body, secret), secret)).toBe(false);
  });
});

describe("CloudApiSender", () => {
  it("monta a requisição da Graph API corretamente", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const sender = new CloudApiSender({
      accessToken: "TOKEN",
      phoneNumberId: "123",
      apiVersion: "v27.0",
      baseUrl: "https://graph.facebook.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await sender.sendText("5511999998888", "Olá!");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v27.0/123/messages");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(init.body as string)).toMatchObject({
      messaging_product: "whatsapp",
      to: "5511999998888",
      type: "text",
      text: { body: "Olá!" },
    });
  });

  it("lança erro quando a API responde erro", async () => {
    const sender = new CloudApiSender({
      accessToken: "T",
      phoneNumberId: "1",
      apiVersion: "v27.0",
      baseUrl: "https://x",
      fetchImpl: (async () => new Response("denied", { status: 401 })) as typeof fetch,
    });
    await expect(sender.sendText("1", "x")).rejects.toThrow("401");
  });
});

describe("normalizeBrMobile (9º dígito)", () => {
  it("reinsere o 9 em celular BR de 12 dígitos", () => {
    expect(normalizeBrMobile("551188887777")).toBe("5511988887777");
  });
  it("não mexe em celular já com 9, fixo BR ou número de outro país", () => {
    expect(normalizeBrMobile("5511988887777")).toBe("5511988887777");
    expect(normalizeBrMobile("551133334444")).toBe("551133334444");
    expect(normalizeBrMobile("15551797781")).toBe("15551797781");
  });
  it("CloudApiSender envia com o 9 e respeita brAddNinthDigit=false", async () => {
    const bodies: Array<{ to: string }> = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const base = { accessToken: "T", phoneNumberId: "1", apiVersion: "v27.0", baseUrl: "https://x", fetchImpl };
    await new CloudApiSender(base).sendText("551188887777", "oi");
    await new CloudApiSender({ ...base, brAddNinthDigit: false }).sendText("551188887777", "oi");
    expect(bodies.map((b) => b.to)).toEqual(["5511988887777", "551188887777"]);
  });
});
