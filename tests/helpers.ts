import { Bot, type BotDeps } from "../src/bot.js";
import { FormDialog } from "../src/forms/formDialog.js";
import { formConfigSchema, type FormSubmitter, type FormValues, type SubmitResult } from "../src/forms/types.js";
import { HandoffDetector } from "../src/handoff.js";
import { KnowledgeBase, loadKnowledgeFile } from "../src/knowledge/knowledgeBase.js";
import type { ChatMessage, ChatModel } from "../src/llm/types.js";
import { SessionStore } from "../src/memory.js";
import { SlidingWindowRateLimiter } from "../src/rateLimiter.js";
import type { MessageSender } from "../src/types.js";
import { createLogger } from "../src/util/logger.js";
import { readFileSync } from "node:fs";

export class FakeSender implements MessageSender {
  sent: Array<{ to: string; text: string }> = [];
  async sendText(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }
  to(contact: string): string[] {
    return this.sent.filter((m) => m.to === contact).map((m) => m.text);
  }
}

export class FakeLlm implements ChatModel {
  calls: ChatMessage[][] = [];
  constructor(private readonly responder: (messages: ChatMessage[]) => string | Promise<string> = () => "resposta do LLM") {}
  async complete(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    return this.responder(messages);
  }
}

export class FakeSubmitter implements FormSubmitter {
  submissions: FormValues[] = [];
  constructor(private readonly result: SubmitResult = { ok: true, confirmation: "Protocolo: TESTE-1" }) {}
  async submit(_config: unknown, values: FormValues): Promise<SubmitResult> {
    this.submissions.push(values);
    return this.result;
  }
}

export const formConfig = formConfigSchema.parse(
  JSON.parse(readFileSync("examples/form-demo/form.config.json", "utf8")),
);

export function makeBot(overrides: Partial<BotDeps> & { withForm?: boolean } = {}) {
  const sender = overrides.sender ?? new FakeSender();
  const submitter = new FakeSubmitter();
  const { withForm = true, ...rest } = overrides;
  const deps: BotDeps = {
    sender,
    sessions: new SessionStore(10, 60 * 60_000),
    knowledge: new KnowledgeBase(loadKnowledgeFile("knowledge/faq.json")),
    rateLimiter: new SlidingWindowRateLimiter(100, 60_000),
    handoff: new HandoffDetector(["atendente", "humano"], ["/bot"]),
    logger: createLogger("silent"),
    llm: null,
    form: withForm
      ? { dialog: new FormDialog(formConfig, null, () => new Date("2026-01-10T12:00:00Z")), submitter }
      : null,
    ...rest,
  };
  return { bot: new Bot(deps), sender: sender as FakeSender, submitter, deps };
}

let counter = 0;
export const msg = (from: string, text?: string, type = "text") => ({
  id: `m${++counter}`,
  from,
  type,
  text,
});
