import { describe, expect, it } from "vitest";
import { MESSAGES } from "../src/bot.js";
import { buildSystemPrompt } from "../src/prompt.js";
import { loadKnowledgeFile } from "../src/knowledge/knowledgeBase.js";
import { makeBot, msg } from "./helpers.js";

// Código de Ética Odontológica, art. 44, I: sem preço, serviço gratuito, modalidade de pagamento, antes e depois.
const PROIBIDO =
  /R\$|\d+\s*(reais|x\b)|gr[aá]tis|gratuit|promo[cç]|desconto|antes e depois|n[aã]o (s[aã]o )?cobrad|abatid|parcel(a|o) em|cart[aã]o de cr[eé]dito|\bpix\b|boleto/i;

describe("FAQ de exemplo segue as regras do CFO", () => {
  const entries = loadKnowledgeFile("knowledge/faq.json");

  it.each(entries.map((e) => [e.title, e.content]))("%s: resposta sem preço/promoção/pagamento", (_t, content) => {
    expect(content).not.toMatch(PROIBIDO);
  });

  it("pergunta de preço responde que depende da avaliação e oferece agendar", async () => {
    const A = "5511333333333";
    const { bot, sender } = makeBot();
    for (const q of ["quanto custa a avaliação?", "qual o valor do clareamento?", "quanto é a consulta?"]) {
      await bot.handleIncoming(msg(A, q));
    }
    const replies = sender.to(A);
    expect(replies).toHaveLength(3);
    for (const r of replies) {
      expect(r).not.toBe(MESSAGES.noKnowledge);
      expect(r).toContain("depende da avaliação");
      expect(r).toContain("quero agendar");
    }
  });

  it("prompt do LLM proíbe preço, promoção e condição de pagamento", () => {
    const p = buildSystemPrompt({ botName: "B", businessName: "C", context: [] });
    expect(p).toContain("Nunca informe preços");
    expect(p).toContain("depende da avaliação");
  });
});
