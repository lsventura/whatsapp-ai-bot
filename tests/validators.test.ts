import { describe, expect, it } from "vitest";
import type { FormField } from "../src/forms/types.js";
import { displayValue, parseBrazilianDate, validateField } from "../src/forms/validators.js";

const field = (over: Partial<FormField>): FormField => ({
  name: "x",
  label: "Campo",
  prompt: "?",
  type: "text",
  selector: "#x",
  required: true,
  ...over,
});
const NOW = new Date("2026-01-10T12:00:00Z");

describe("validators", () => {
  it("e-mail", () => {
    expect(validateField(field({ type: "email" }), " Joao@Exemplo.com ")).toEqual({ ok: true, value: "joao@exemplo.com" });
    expect(validateField(field({ type: "email" }), "joao@").ok).toBe(false);
  });

  it("telefone BR (remove máscara e +55)", () => {
    expect(validateField(field({ type: "phone" }), "(11) 99999-8888")).toEqual({ ok: true, value: "11999998888" });
    expect(validateField(field({ type: "phone" }), "+55 11 99999-8888")).toEqual({ ok: true, value: "11999998888" });
    expect(validateField(field({ type: "phone" }), "9999-8888").ok).toBe(false);
  });

  it("data DD/MM/AAAA -> ISO e rejeita passado/inválida", () => {
    expect(validateField(field({ type: "date" }), "25/12/2026", NOW)).toEqual({ ok: true, value: "2026-12-25" });
    expect(validateField(field({ type: "date" }), "01/01/2025", NOW).ok).toBe(false);
    expect(validateField(field({ type: "date" }), "31/02/2026", NOW).ok).toBe(false);
    expect(validateField(field({ type: "date" }), "amanhã", NOW).ok).toBe(false);
  });

  it("parseBrazilianDate aceita variações", () => {
    expect(parseBrazilianDate("5-3-27")).toBe("2027-03-05");
    expect(parseBrazilianDate("5.3.2027")).toBe("2027-03-05");
  });

  it("select casa por rótulo, valor ou parcial, sem acento", () => {
    const f = field({
      type: "select",
      options: [
        { value: "avaliacao", label: "Avaliação" },
        { value: "urgencia", label: "Urgência" },
      ],
    });
    expect(validateField(f, "avaliacao")).toEqual({ ok: true, value: "avaliacao" });
    expect(validateField(f, "URGÊNCIA")).toEqual({ ok: true, value: "urgencia" });
    expect(validateField(f, "quero uma avaliação").ok).toBe(true);
    expect(validateField(f, "cirurgia").ok).toBe(false);
  });

  it("campo opcional aceita 'não' como vazio; obrigatório não aceita vazio", () => {
    expect(validateField(field({ required: false, type: "textarea" }), "não")).toEqual({ ok: true, value: "" });
    expect(validateField(field({}), "   ").ok).toBe(false);
  });

  it("formata valores para exibição", () => {
    expect(displayValue(field({ type: "date" }), "2026-12-25")).toBe("25/12/2026");
    expect(displayValue(field({ type: "phone" }), "11999998888")).toBe("(11) 99999-8888");
    expect(displayValue(field({ type: "text" }), "")).toBe("—");
  });
});
