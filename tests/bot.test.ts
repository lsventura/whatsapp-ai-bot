import { describe, expect, it } from "vitest";
import { MESSAGES } from "../src/bot.js";
import { SlidingWindowRateLimiter } from "../src/rateLimiter.js";
import { FakeLlm, FakeSender, FakeSubmitter, makeBot, msg } from "./helpers.js";

const A = "5511111111111";
const B = "5522222222222";

describe("Bot — respostas", () => {
  it("modo sem LLM: responde com a entrada mais relevante da base", async () => {
    const { bot, sender } = makeBot();
    await bot.handleIncoming(msg(A, "qual o horário de funcionamento?"));
    expect(sender.to(A)[0]).toContain("segunda a sexta");
  });

  it("modo sem LLM: assunto desconhecido sugere atendente", async () => {
    const { bot, sender } = makeBot();
    await bot.handleIncoming(msg(A, "previsão do tempo em Marte"));
    expect(sender.to(A)[0]).toBe(MESSAGES.noKnowledge);
  });

  it("com LLM: injeta o contexto da base no prompt (grounding) e devolve a resposta do modelo", async () => {
    const llm = new FakeLlm(() => "Abrimos das 8h às 18h.");
    const { bot, sender } = makeBot({ llm });
    await bot.handleIncoming(msg(A, "que horas vocês abrem?"));

    expect(sender.to(A)).toEqual(["Abrimos das 8h às 18h."]);
    const [system] = llm.calls[0]!;
    expect(system?.role).toBe("system");
    expect(system?.content).toContain("segunda a sexta");
    expect(system?.content).toContain("SOMENTE");
  });

  it("memória por contato: o histórico vai no prompt seguinte, sem vazar entre contatos", async () => {
    const llm = new FakeLlm((m) => `resp-${m.length}`);
    const { bot } = makeBot({ llm });
    await bot.handleIncoming(msg(A, "quanto custa a avaliação?"));
    await bot.handleIncoming(msg(A, "e aceita pix?"));
    await bot.handleIncoming(msg(B, "oi"));

    const second = llm.calls[1]!;
    expect(second.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(second[1]?.content).toBe("quanto custa a avaliação?");

    const forB = llm.calls[2]!;
    expect(forB.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("se o LLM falhar, usa a base como fallback ou pede desculpas", async () => {
    const llm = new FakeLlm(() => {
      throw new Error("API fora do ar");
    });
    const { bot, sender } = makeBot({ llm });
    await bot.handleIncoming(msg(A, "qual o endereço?"));
    await bot.handleIncoming(msg(A, "assunto totalmente aleatório xyz"));
    expect(sender.to(A)[0]).toContain("Rua das Acácias");
    expect(sender.to(A)[1]).toBe(MESSAGES.llmError);
  });

  it("mensagens que não são texto recebem orientação", async () => {
    const { bot, sender } = makeBot();
    await bot.handleIncoming(msg(A, undefined, "audio"));
    expect(sender.to(A)).toEqual([MESSAGES.nonText]);
  });

  it("ignora mensagens duplicadas (reenvio do webhook)", async () => {
    const { bot, sender } = makeBot();
    const m = msg(A, "horário?");
    await Promise.all([bot.handleIncoming(m), bot.handleIncoming(m)]);
    expect(sender.to(A)).toHaveLength(1);
  });
});

describe("Bot — handoff humano", () => {
  it("palavra-chave ativa o handoff, bot fica em silêncio e /bot retoma", async () => {
    const { bot, sender } = makeBot();
    await bot.handleIncoming(msg(A, "quero falar com um atendente"));
    expect(sender.to(A)).toEqual([MESSAGES.handoffStart]);

    await bot.handleIncoming(msg(A, "qual o horário?"));
    expect(sender.to(A)).toHaveLength(1); // silêncio

    await bot.handleIncoming(msg(A, "/bot"));
    expect(sender.to(A)[1]).toBe(MESSAGES.handoffEnd);

    await bot.handleIncoming(msg(A, "qual o horário?"));
    expect(sender.to(A)[2]).toContain("segunda a sexta");
  });

  it("handoff de um contato não afeta os demais", async () => {
    const { bot, sender } = makeBot();
    await bot.handleIncoming(msg(A, "atendente"));
    await bot.handleIncoming(msg(B, "qual o endereço?"));
    expect(sender.to(B)[0]).toContain("Rua das Acácias");
  });

  it("notifica o atendente humano configurado", async () => {
    const { bot, sender } = makeBot({ notifyNumber: "5599000000000" });
    await bot.handleIncoming({ ...msg(A, "preciso de um atendente"), name: "Maria" });
    expect(sender.to("5599000000000")[0]).toContain("Maria");
  });

  it("expira o handoff após o TTL", async () => {
    let t = 1_000_000;
    const { bot, sender } = makeBot({ now: () => t, handoffTtlMs: 60_000 });
    await bot.handleIncoming(msg(A, "atendente"));
    t += 120_000;
    await bot.handleIncoming(msg(A, "oi"));
    expect(sender.to(A)[1]).toBe(MESSAGES.handoffEnd);
  });
});

describe("Bot — rate limit", () => {
  it("bloqueia o excesso, avisa uma única vez e não chama o LLM", async () => {
    const llm = new FakeLlm();
    const { bot, sender } = makeBot({ llm, rateLimiter: new SlidingWindowRateLimiter(2, 60_000) });
    for (let i = 0; i < 6; i++) await bot.handleIncoming(msg(A, `pergunta ${i} sobre horário`));
    const replies = sender.to(A);
    expect(replies).toHaveLength(3); // 2 respostas + 1 aviso
    expect(replies[2]).toContain("muitas mensagens");
    expect(llm.calls).toHaveLength(2);
  });
});

describe("Bot — concorrência", () => {
  it("atende contatos diferentes em paralelo e mantém a ordem dentro do mesmo contato", async () => {
    const order: string[] = [];
    const llm = new FakeLlm(async (messages) => {
      const last = messages.at(-1)!.content;
      await new Promise((r) => setTimeout(r, last.startsWith("lento") ? 60 : 5));
      order.push(last);
      return `ok:${last}`;
    });
    const { bot, sender } = makeBot({ llm });

    await Promise.all([
      bot.handleIncoming(msg(A, "lento A1")),
      bot.handleIncoming(msg(A, "rapido A2")),
      bot.handleIncoming(msg(B, "rapido B1")),
    ]);

    // B não esperou o contato A
    expect(order.indexOf("rapido B1")).toBeLessThan(order.indexOf("lento A1"));
    // A1 respondido antes de A2
    expect(sender.to(A)).toEqual(["ok:lento A1", "ok:rapido A2"]);
    expect(sender.to(B)).toEqual(["ok:rapido B1"]);
  });

  it("processa 50 contatos simultâneos sem misturar respostas", async () => {
    const llm = new FakeLlm(async (m) => {
      await new Promise((r) => setTimeout(r, Math.random() * 10));
      return `eco:${m.at(-1)!.content}`;
    });
    const { bot, sender } = makeBot({ llm });
    const contacts = Array.from({ length: 50 }, (_, i) => `55${String(i).padStart(11, "0")}`);
    await Promise.all(contacts.map((c) => bot.handleIncoming(msg(c, `msg-de-${c}`))));
    for (const c of contacts) expect(sender.to(c)).toEqual([`eco:msg-de-${c}`]);
  });
});

describe("Bot — formulário", () => {
  const conversation = [
    "quero agendar",
    "Maria da Silva",
    "maria@exemplo.com",
    "11988887777",
    "avaliação",
    "20/01/2099",
    "não",
    "sim",
  ];

  it("coleta os campos pela conversa e envia pelo submitter", async () => {
    const { bot, sender, submitter } = makeBot();
    for (const text of conversation) await bot.handleIncoming(msg(A, text));

    expect(submitter.submissions).toEqual([
      {
        nome: "Maria da Silva",
        email: "maria@exemplo.com",
        telefone: "11988887777",
        servico: "avaliacao",
        data: "2099-01-20",
        observacoes: "",
      },
    ]);
    expect(sender.to(A).at(-1)).toContain("Protocolo: TESTE-1");
  });

  it("dois contatos preenchendo formulários ao mesmo tempo não se misturam", async () => {
    const { bot, submitter } = makeBot();
    const run = async (contact: string, nome: string) => {
      const steps = [...conversation];
      steps[1] = nome;
      for (const text of steps) await bot.handleIncoming(msg(contact, text));
    };
    await Promise.all([run(A, "Ana"), run(B, "Bruno")]);
    expect(submitter.submissions.map((s) => s.nome).sort()).toEqual(["Ana", "Bruno"]);
  });

  it("informa erro amigável se o envio falhar", async () => {
    const failing = new FakeSubmitter({ ok: false, error: "timeout" });
    const base = makeBot();
    const { bot, sender } = makeBot({ form: { dialog: base.deps.form!.dialog, submitter: failing } });
    for (const text of conversation) await bot.handleIncoming(msg(A, text));
    expect(sender.to(A).at(-1)).toBe(MESSAGES.formError);
  });

  it("pedir atendente no meio do formulário abandona a coleta", async () => {
    const { bot, sender, submitter } = makeBot();
    await bot.handleIncoming(msg(A, "quero agendar"));
    await bot.handleIncoming(msg(A, "atendente"));
    expect(sender.to(A).at(-1)).toBe(MESSAGES.handoffStart);
    expect(submitter.submissions).toHaveLength(0);
  });
});

describe("sender", () => {
  it("FakeSender isola destinatários", async () => {
    const s = new FakeSender();
    await s.sendText("1", "a");
    expect(s.to("2")).toEqual([]);
  });
});
