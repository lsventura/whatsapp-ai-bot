import { describe, expect, it } from "vitest";
import { normalize, splitMessage, tokenize } from "../src/util/text.js";
import { maskPhone } from "../src/util/phone.js";

describe("texto", () => {
  it("normaliza acentos e caixa", () => {
    expect(normalize("  Horário DE Funcionamento?! ")).toBe("horario de funcionamento");
  });

  it("tokeniza removendo stopwords e plural", () => {
    expect(tokenize("Quais são os horários?")).toEqual(["sao", "horario"]);
  });

  it("não quebra mensagens curtas", () => {
    expect(splitMessage("oi")).toEqual(["oi"]);
  });

  it("quebra mensagens longas respeitando o limite", () => {
    const text = Array.from({ length: 10 }, (_, i) => `parágrafo ${i} ${"x".repeat(100)}`).join("\n\n");
    const parts = splitMessage(text, 300);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 300)).toBe(true);
    expect(parts.join("\n\n")).toBe(text);
  });

  it("quebra um parágrafo gigante sem perder conteúdo", () => {
    const parts = splitMessage("a".repeat(1000), 400);
    expect(parts.map((p) => p.length)).toEqual([400, 400, 200]);
  });

  it("mascara telefone para logs", () => {
    expect(maskPhone("5511999998888")).toBe("5511*****8888");
  });
});
