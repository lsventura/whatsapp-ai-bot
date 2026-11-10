import { describe, expect, it } from "vitest";
import { MESSAGES } from "../src/bot.js";
import { isGreeting, parseChoice } from "../src/menu.js";
import { FakeLlm, makeBot, msg } from "./helpers.js";

const A = "5511111111111";

describe("menu numerado (fallback sem LLM)", () => {
  it("reconhece cumprimentos e escolhas", () => {
    expect(isGreeting("Oi!")).toBe(true);
    expect(isGreeting("Bom dia, tudo bem?")).toBe(true);
    expect(isGreeting("oi, quanto custa?")).toBe(false);
    expect(parseChoice("2")).toBe(2);
    expect(parseChoice("opção 3")).toBe(3);
    expect(parseChoice("2 dentes")).toBeNull();
  });

  it("'oi' mostra o menu e o número responde a opção", async () => {
    const { bot, sender } = makeBot();
    await bot.handleIncoming(msg(A, "oi"));
    expect(sender.to(A)[0]).toContain("*1* - Qual o horário de funcionamento?");
    expect(sender.to(A)[0]).toContain("quero agendar");
    await bot.handleIncoming(msg(A, "2"));
    expect(sender.to(A)[1]).toContain("Rua das Acácias");
    await bot.handleIncoming(msg(A, "99"));
    expect(sender.to(A)[2]).toContain("Não tenho a opção 99");
  });

  it("número solto sem menu antes não vira opção", async () => {
    const { bot, sender } = makeBot();
    await bot.handleIncoming(msg(A, "2"));
    expect(sender.to(A)[0]).toBe(MESSAGES.noKnowledge);
  });

  it("com LLM, 'oi' vai pro modelo mas 'menu' mostra o menu", async () => {
    const llm = new FakeLlm(() => "Olá, como posso ajudar?");
    const { bot, sender } = makeBot({ llm });
    await bot.handleIncoming(msg(A, "oi"));
    await bot.handleIncoming(msg(A, "menu"));
    expect(sender.to(A)[0]).toBe("Olá, como posso ajudar?");
    expect(sender.to(A)[1]).toContain("*1* -");
  });

  it("menuEnabled=false desliga", async () => {
    const { bot, sender } = makeBot({ menuEnabled: false });
    await bot.handleIncoming(msg(A, "menu"));
    expect(sender.to(A)[0]).toBe(MESSAGES.noKnowledge);
  });
});
