import { describe, expect, it, vi } from "vitest";
import { LlmError, OpenAICompatibleClient } from "../src/llm/openaiCompatible.js";

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

const client = (fetchImpl: typeof fetch, retries = 1) =>
  new OpenAICompatibleClient({
    apiKey: "KEY",
    baseUrl: "http://llm.local/v1/",
    model: "modelo-x",
    temperature: 0.2,
    timeoutMs: 1000,
    fetchImpl,
    retries,
  });

describe("OpenAICompatibleClient", () => {
  it("envia modelo, mensagens e chave; devolve o texto", async () => {
    const fetchImpl = vi.fn(async () => ok(" olá "));
    const answer = await client(fetchImpl as unknown as typeof fetch).complete([{ role: "user", content: "oi" }]);
    expect(answer).toBe("olá");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://llm.local/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer KEY");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "modelo-x", temperature: 0.2 });
  });

  it("pede JSON quando solicitado", async () => {
    const fetchImpl = vi.fn(async () => ok("{}"));
    await client(fetchImpl as unknown as typeof fetch).complete([{ role: "user", content: "x" }], { json: true });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).response_format).toEqual({ type: "json_object" });
  });

  it("tenta de novo em erro 5xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("falhou", { status: 503 }))
      .mockResolvedValueOnce(ok("deu certo"));
    await expect(client(fetchImpl as unknown as typeof fetch).complete([])).resolves.toBe("deu certo");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("não tenta de novo em erro 4xx (ex.: chave inválida)", async () => {
    const fetchImpl = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    await expect(client(fetchImpl as unknown as typeof fetch).complete([])).rejects.toBeInstanceOf(LlmError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("erro quando a resposta vem vazia", async () => {
    const fetchImpl = vi.fn(async () => ok(""));
    await expect(client(fetchImpl as unknown as typeof fetch, 0).complete([])).rejects.toThrow("vazia");
  });
});
