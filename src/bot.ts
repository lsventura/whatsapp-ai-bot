import type { ChatModel } from "./llm/types.js";
import type { KnowledgeBase } from "./knowledge/knowledgeBase.js";
import type { SessionStore } from "./memory.js";
import type { SlidingWindowRateLimiter } from "./rateLimiter.js";
import type { HandoffDetector } from "./handoff.js";
import type { FormDialog, FormState } from "./forms/formDialog.js";
import type { FormSubmitter } from "./forms/types.js";
import type { IncomingMessage, MessageSender } from "./types.js";
import type { Logger } from "./util/logger.js";
import { KeyedQueue, Semaphore } from "./util/concurrency.js";
import { maskPhone } from "./util/phone.js";
import { splitMessage } from "./util/text.js";
import { buildSystemPrompt } from "./prompt.js";

export interface BotDeps {
  sender: MessageSender;
  sessions: SessionStore;
  knowledge: KnowledgeBase;
  rateLimiter: SlidingWindowRateLimiter;
  handoff: HandoffDetector;
  logger: Logger;
  /** null = modo sem LLM (responde só com a base de conhecimento) */
  llm: ChatModel | null;
  llmGate?: Semaphore;
  form?: { dialog: FormDialog; submitter: FormSubmitter } | null;
  botName?: string;
  businessName?: string;
  topK?: number;
  handoffTtlMs?: number;
  /** número de um atendente humano que recebe aviso quando um cliente pede handoff */
  notifyNumber?: string;
  now?: () => number;
}

export const MESSAGES = {
  rateLimited: (seconds: number) =>
    `Você enviou muitas mensagens em pouco tempo 🙂 Aguarde cerca de ${seconds}s e continue de onde parou.`,
  nonText: "Por enquanto só consigo entender mensagens de texto. Pode escrever sua dúvida? Se preferir, digite *atendente*.",
  handoffStart:
    "Certo! Vou chamar um atendente humano para continuar com você. Assim que possível ele responde por aqui. " +
    "Para voltar a falar comigo, digite */bot*.",
  handoffEnd: "Pronto, voltei! Como posso ajudar?",
  llmError: "Tive um problema técnico para responder agora. Pode tentar novamente em instantes? Se preferir, digite *atendente*.",
  noKnowledge:
    "Não encontrei essa informação por aqui. Digite *atendente* para falar com uma pessoa ou reformule sua pergunta.",
  formError: "Não consegui enviar o formulário agora 😕 Tente novamente em alguns minutos ou digite *atendente*.",
  formSuccess: (confirmation?: string) =>
    `✅ Pedido enviado com sucesso!${confirmation ? ` ${confirmation}` : ""}\nEntraremos em contato para confirmar.`,
};

/**
 * Orquestra uma mensagem recebida:
 * dedupe → fila por contato → rate limit → handoff → formulário → resposta (KB + LLM).
 */
export class Bot {
  private readonly queue = new KeyedQueue();
  private readonly seen = new Map<string, number>();
  private readonly llmGate: Semaphore;
  private readonly now: () => number;

  constructor(private readonly deps: BotDeps) {
    this.llmGate = deps.llmGate ?? new Semaphore(4);
    this.now = deps.now ?? Date.now;
  }

  /** Ponto de entrada. Retorna quando a mensagem foi totalmente processada. */
  handleIncoming(message: IncomingMessage): Promise<void> {
    if (this.isDuplicate(message.id)) {
      this.deps.logger.debug({ id: message.id }, "mensagem duplicada ignorada");
      return Promise.resolve();
    }
    return this.queue.enqueue(message.from, () => this.process(message)).catch((error) => {
      this.deps.logger.error({ err: error, contact: maskPhone(message.from) }, "erro ao processar mensagem");
    });
  }

  private async process(message: IncomingMessage): Promise<void> {
    const { sessions, rateLimiter, handoff, sender, logger } = this.deps;
    const contact = message.from;

    void sender.markRead?.(message.id)?.catch(() => undefined);

    const limit = rateLimiter.check(contact);
    if (!limit.allowed) {
      logger.warn({ contact: maskPhone(contact) }, "rate limit excedido");
      if (limit.shouldWarn) await this.reply(contact, MESSAGES.rateLimited(limit.retryAfterSeconds));
      return;
    }

    const session = sessions.get(contact);
    if (message.name) session.name = message.name;

    if (!message.text?.trim()) {
      if (!session.handoff?.active) await this.reply(contact, MESSAGES.nonText);
      return;
    }
    const text = message.text.trim();

    // 1) conversa com humano em andamento: bot fica quieto
    if (session.handoff?.active) {
      const ttl = this.deps.handoffTtlMs ?? 4 * 60 * 60_000;
      const expired = this.now() - session.handoff.since > ttl;
      if (expired || handoff.wantsBot(text)) {
        session.handoff = null;
        await this.reply(contact, MESSAGES.handoffEnd);
      } else {
        logger.info({ contact: maskPhone(contact) }, "mensagem encaminhada ao atendente humano (bot em silêncio)");
      }
      return;
    }

    // 2) pedido explícito de humano (vale até no meio de um formulário)
    if (handoff.wantsHuman(text)) {
      session.handoff = { active: true, since: this.now() };
      session.formState = null;
      await this.reply(contact, MESSAGES.handoffStart);
      await this.notifyHuman(contact, session.name, text);
      return;
    }

    // 3) automação de formulário
    const form = this.deps.form;
    if (form) {
      const state = session.formState as FormState | null;
      if (state || form.dialog.matchesTrigger(text)) {
        await this.handleForm(contact, text, state);
        return;
      }
    }

    // 4) pergunta normal: KB + LLM
    const answer = await this.answer(contact, text);
    sessions.addMessage(contact, { role: "user", content: text });
    sessions.addMessage(contact, { role: "assistant", content: answer });
    await this.reply(contact, answer);
  }

  private async handleForm(contact: string, text: string, state: FormState | null): Promise<void> {
    const form = this.deps.form!;
    const session = this.deps.sessions.get(contact);

    const result = state ? await form.dialog.handle(state, text) : await form.dialog.start(text);
    session.formState = result.state;
    await this.reply(contact, result.reply);

    if (!result.submit) return;

    const outcome = await form.submitter.submit(form.dialog.config, result.submit);
    this.deps.logger.info({ contact: maskPhone(contact), ok: outcome.ok }, "formulário processado");
    await this.reply(contact, outcome.ok ? MESSAGES.formSuccess(outcome.confirmation) : MESSAGES.formError);
  }

  private async answer(contact: string, text: string): Promise<string> {
    const { knowledge, llm, sessions, logger } = this.deps;
    const hits = knowledge.search(text, this.deps.topK ?? 3);

    // sem LLM: devolve a melhor entrada da KB (modo "FAQ bot")
    if (!llm) return hits[0]?.entry.content ?? MESSAGES.noKnowledge;

    const session = sessions.get(contact);
    const system = buildSystemPrompt({
      botName: this.deps.botName ?? "Assistente",
      businessName: this.deps.businessName ?? "nossa empresa",
      context: hits.map((h) => h.entry),
      formHint: this.deps.form
        ? `Se o usuário quiser agendar/solicitar algo, oriente a digitar "${this.deps.form.dialog.config.triggers[0]}".`
        : undefined,
    });

    try {
      return await this.llmGate.run(() =>
        llm.complete([{ role: "system", content: system }, ...session.history, { role: "user", content: text }]),
      );
    } catch (error) {
      logger.error({ err: error }, "falha no LLM");
      // degrada com elegância: se a KB tem uma resposta clara, usa ela
      return hits[0]?.entry.content ?? MESSAGES.llmError;
    }
  }

  private async notifyHuman(contact: string, name: string | undefined, text: string): Promise<void> {
    const target = this.deps.notifyNumber;
    if (!target) return;
    const who = name ? `${name} (${contact})` : contact;
    try {
      await this.deps.sender.sendText(target, `🔔 Handoff solicitado por ${who}.\nÚltima mensagem: "${text.slice(0, 200)}"`);
    } catch (error) {
      this.deps.logger.error({ err: error }, "falha ao notificar atendente");
    }
  }

  private async reply(contact: string, text: string): Promise<void> {
    for (const part of splitMessage(text)) {
      await this.deps.sender.sendText(contact, part);
    }
  }

  /** Cache de ids vistos (a Meta reenvia o webhook se demorarmos a responder 200). */
  private isDuplicate(id: string): boolean {
    const t = this.now();
    for (const [key, ts] of this.seen) {
      if (t - ts > 10 * 60_000) this.seen.delete(key);
      else break; // Map mantém ordem de inserção
    }
    if (this.seen.has(id)) return true;
    this.seen.set(id, t);
    return false;
  }
}
