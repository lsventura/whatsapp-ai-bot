import { describe, expect, it } from "vitest";
import { FormDialog, type DialogResult } from "../src/forms/formDialog.js";
import { FakeLlm, formConfig } from "./helpers.js";

const NOW = () => new Date("2026-01-10T12:00:00Z");

async function run(dialog: FormDialog, messages: string[]): Promise<DialogResult> {
  let result = await dialog.start(messages[0]!);
  for (const text of messages.slice(1)) {
    if (!result.state) break;
    result = await dialog.handle(result.state, text);
  }
  return result;
}

describe("FormDialog", () => {
  it("reconhece gatilhos", () => {
    const d = new FormDialog(formConfig, null, NOW);
    expect(d.matchesTrigger("Oi, quero agendar uma consulta")).toBe(true);
    expect(d.matchesTrigger("qual o horário?")).toBe(false);
  });

  it("coleta todos os campos, confirma e devolve os valores para envio", async () => {
    const d = new FormDialog(formConfig, null, NOW);
    const result = await run(d, [
      "quero agendar",
      "Maria da Silva",
      "maria@exemplo.com",
      "(11) 98888-7777",
      "limpeza",
      "20/01/2026",
      "não",
      "sim",
    ]);
    expect(result.submit).toEqual({
      nome: "Maria da Silva",
      email: "maria@exemplo.com",
      telefone: "11988887777",
      servico: "limpeza",
      data: "2026-01-20",
      observacoes: "",
    });
    expect(result.state).toBeNull();
  });

  it("repete a pergunta quando a resposta é inválida", async () => {
    const d = new FormDialog(formConfig, null, NOW);
    const result = await run(d, ["quero agendar", "Maria", "email-errado"]);
    expect(result.state).toMatchObject({ status: "collecting", current: "email" });
    expect(result.reply).toContain("e-mail");
  });

  it("permite corrigir um campo na confirmação", async () => {
    const d = new FormDialog(formConfig, null, NOW);
    const result = await run(d, [
      "quero agendar",
      "Maria da Silva",
      "maria@exemplo.com",
      "11988887777",
      "limpeza",
      "20/01/2026",
      "não",
      "não", // quero corrigir
      "2", // campo e-mail
      "maria.nova@exemplo.com",
    ]);
    expect(result.state).toMatchObject({ status: "confirming" });
    expect(result.reply).toContain("maria.nova@exemplo.com");
  });

  it("cancela a qualquer momento", async () => {
    const d = new FormDialog(formConfig, null, NOW);
    const result = await run(d, ["quero agendar", "Maria", "cancelar"]);
    expect(result.state).toBeNull();
    expect(result.submit).toBeUndefined();
  });

  it("usa o LLM para extrair vários campos de uma mensagem livre e pula essas perguntas", async () => {
    const llm = new FakeLlm(() =>
      JSON.stringify({ nome: "João Pereira", email: "joao@exemplo.com", telefone: "campo-inventado-invalido" }),
    );
    const d = new FormDialog(formConfig, llm, NOW);
    const result = await d.start("quero agendar, sou João Pereira, joao@exemplo.com");
    expect(result.state).toMatchObject({ status: "collecting", current: "telefone" });
    expect((result.state as { values: Record<string, string> }).values).toEqual({
      nome: "João Pereira",
      email: "joao@exemplo.com",
    });
  });

  it("se o LLM falhar ou devolver lixo, segue o fluxo pergunta a pergunta", async () => {
    const d = new FormDialog(formConfig, new FakeLlm(() => "isso não é json"), NOW);
    const result = await d.start("quero agendar");
    expect(result.state).toMatchObject({ status: "collecting", current: "nome" });
  });
});
