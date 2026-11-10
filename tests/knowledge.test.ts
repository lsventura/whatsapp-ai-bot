import { describe, expect, it } from "vitest";
import { KnowledgeBase, loadKnowledgeFile, parseKnowledge } from "../src/knowledge/knowledgeBase.js";

describe("KnowledgeBase", () => {
  const kb = new KnowledgeBase(loadKnowledgeFile("knowledge/faq.json"));

  it("carrega o FAQ de exemplo", () => {
    expect(kb.entries.length).toBeGreaterThanOrEqual(8);
  });

  it.each([
    ["que horas vocês abrem?", "Qual o horário de funcionamento?"],
    ["qual é o endereço de vocês", "Onde fica a clínica? Qual o endereço?"],
    ["aceita pix e parcelamento no cartão?", "Como funciona o pagamento?"],
    ["quanto custa a avaliação", "Quanto custa a consulta ou o tratamento?"],
    ["tem convênio?", "Vocês aceitam convênio ou plano odontológico?"],
    ["quero clarear os dentes, como funciona o clareamento", "Clareamento dental: como funciona?"],
  ])("recupera a entrada certa para %j", (query, expectedTitle) => {
    expect(kb.search(query)[0]?.entry.title).toBe(expectedTitle);
  });

  it("não devolve nada para assunto fora da base", () => {
    expect(kb.search("qual a previsão do tempo em Marte")).toEqual([]);
  });

  it("respeita topK", () => {
    expect(kb.search("consulta preço pagamento horário", 2).length).toBeLessThanOrEqual(2);
  });

  it("parseia Markdown por seção ##", () => {
    const entries = parseKnowledge("# Título\nintro\n\n## Frete\nEntregamos em 3 dias.\n\n## Troca\nAté 7 dias.", "md");
    expect(entries.map((e) => e.title)).toEqual(["Frete", "Troca"]);
    expect(entries[0]?.content).toBe("Entregamos em 3 dias.");
  });

  it("rejeita JSON fora do formato", () => {
    expect(() => parseKnowledge('[{"foo": 1}]', "json")).toThrow();
  });
});
