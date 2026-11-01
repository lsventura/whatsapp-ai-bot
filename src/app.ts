import { existsSync, readFileSync } from "node:fs";
import { Bot } from "./bot.js";
import { hasLlm, type AppConfig } from "./config.js";
import { FormDialog } from "./forms/formDialog.js";
import { PlaywrightFormSubmitter } from "./forms/playwrightSubmitter.js";
import { formConfigSchema, type FormSubmitter } from "./forms/types.js";
import { HandoffDetector } from "./handoff.js";
import { KnowledgeBase, loadKnowledgeFile } from "./knowledge/knowledgeBase.js";
import { OpenAICompatibleClient } from "./llm/openaiCompatible.js";
import type { ChatModel } from "./llm/types.js";
import { SessionStore } from "./memory.js";
import { SlidingWindowRateLimiter } from "./rateLimiter.js";
import type { MessageSender } from "./types.js";
import { Semaphore } from "./util/concurrency.js";
import type { Logger } from "./util/logger.js";

export interface BuiltBot {
  bot: Bot;
  sessions: SessionStore;
  rateLimiter: SlidingWindowRateLimiter;
  submitter: PlaywrightFormSubmitter | null;
  /** libera timers e o navegador */
  shutdown: () => Promise<void>;
}

/** Monta todas as peças a partir da configuração (.env). */
export function buildBot(
  config: AppConfig,
  sender: MessageSender,
  logger: Logger,
  overrides: { llm?: ChatModel | null; submitter?: FormSubmitter } = {},
): BuiltBot {
  const knowledge = new KnowledgeBase(loadKnowledgeFile(config.KNOWLEDGE_FILE));
  logger.info({ entries: knowledge.entries.length, file: config.KNOWLEDGE_FILE }, "base de conhecimento carregada");

  const llm =
    overrides.llm !== undefined
      ? overrides.llm
      : hasLlm(config)
        ? new OpenAICompatibleClient({
            apiKey: config.LLM_API_KEY,
            baseUrl: config.LLM_BASE_URL,
            model: config.LLM_MODEL,
            temperature: config.LLM_TEMPERATURE,
            timeoutMs: config.LLM_TIMEOUT_MS,
          })
        : null;
  if (!llm) logger.warn("LLM_API_KEY não definida: respondendo apenas com a base de conhecimento (modo FAQ)");

  const sessions = new SessionStore(config.MEMORY_MAX_TURNS, config.MEMORY_TTL_MINUTES * 60_000);
  const rateLimiter = new SlidingWindowRateLimiter(
    config.RATE_LIMIT_MAX_MESSAGES,
    config.RATE_LIMIT_WINDOW_SECONDS * 1000,
  );

  let submitter: PlaywrightFormSubmitter | null = null;
  let form: { dialog: FormDialog; submitter: FormSubmitter } | null = null;
  if (config.FORM_ENABLED && existsSync(config.FORM_CONFIG_FILE)) {
    const formConfig = formConfigSchema.parse(JSON.parse(readFileSync(config.FORM_CONFIG_FILE, "utf8")));
    const activeSubmitter =
      overrides.submitter ??
      (submitter = new PlaywrightFormSubmitter({
        headless: config.FORM_HEADLESS,
        baseUrl: config.PUBLIC_BASE_URL,
        logger,
      }));
    form = { dialog: new FormDialog(formConfig, llm), submitter: activeSubmitter };
    logger.info({ form: formConfig.id }, "automação de formulário habilitada");
  }

  const bot = new Bot({
    sender,
    sessions,
    knowledge,
    rateLimiter,
    handoff: new HandoffDetector(config.HANDOFF_KEYWORDS, config.HANDOFF_RESUME_KEYWORDS),
    logger,
    llm,
    llmGate: new Semaphore(config.LLM_MAX_CONCURRENCY),
    form,
    botName: config.BOT_NAME,
    businessName: config.BUSINESS_NAME,
    topK: config.KNOWLEDGE_TOP_K,
    handoffTtlMs: config.HANDOFF_TTL_MINUTES * 60_000,
    notifyNumber: config.HANDOFF_NOTIFY_NUMBER || undefined,
  });

  const sweeper = setInterval(() => {
    sessions.sweep();
    rateLimiter.sweep();
  }, 5 * 60_000);
  sweeper.unref();

  return {
    bot,
    sessions,
    rateLimiter,
    submitter,
    shutdown: async () => {
      clearInterval(sweeper);
      await submitter?.close();
    },
  };
}
