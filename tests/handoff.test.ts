import { describe, expect, it } from "vitest";
import { HandoffDetector } from "../src/handoff.js";

const detector = new HandoffDetector(["atendente", "falar com uma pessoa"], ["/bot", "voltar ao bot"]);

describe("HandoffDetector", () => {
  it("detecta palavras-chave ignorando acento e caixa", () => {
    expect(detector.wantsHuman("Quero falar com um ATENDENTE, por favor")).toBe(true);
    expect(detector.wantsHuman("quero falar com uma pessoa")).toBe(true);
  });

  it("não dispara em conversa normal nem em substrings", () => {
    expect(detector.wantsHuman("qual o horário de funcionamento?")).toBe(false);
    expect(detector.wantsHuman("atendentes são simpáticos")).toBe(false);
  });

  it("detecta o comando de voltar ao bot", () => {
    expect(detector.wantsBot("/bot")).toBe(true);
    expect(detector.wantsBot("Voltar ao bot")).toBe(true);
    expect(detector.wantsBot("quero o bot de volta")).toBe(false);
  });
});
