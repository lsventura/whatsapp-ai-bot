import { describe, expect, it } from "vitest";
import { hasLlm, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("aplica padrões e converte listas/números/booleans", () => {
    const c = loadConfig({});
    expect(c.PORT).toBe(3000);
    expect(c.HANDOFF_KEYWORDS).toContain("atendente");
    expect(c.FORM_HEADLESS).toBe(true);
    expect(hasLlm(c)).toBe(false);
  });

  it("lê overrides", () => {
    const c = loadConfig({
      PORT: "8080",
      LLM_API_KEY: "k",
      LLM_BASE_URL: "http://localhost:11434/v1",
      LLM_MODEL: "llama3.1",
      HANDOFF_KEYWORDS: " humano , suporte ",
      FORM_HEADLESS: "false",
    });
    expect(c.PORT).toBe(8080);
    expect(c.LLM_MODEL).toBe("llama3.1");
    expect(c.HANDOFF_KEYWORDS).toEqual(["humano", "suporte"]);
    expect(c.FORM_HEADLESS).toBe(false);
    expect(hasLlm(c)).toBe(true);
  });

  it("falha com mensagem clara em valores inválidos", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ LLM_BASE_URL: "não-é-url" })).toThrow(/LLM_BASE_URL/);
  });
});
