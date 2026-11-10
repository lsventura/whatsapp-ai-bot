import { z } from "zod";

const csv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  /** 0.0.0.0 = todas as interfaces (Docker); 127.0.0.1 = só local, atrás de proxy (Caddy/nginx) */
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // --- WhatsApp Cloud API (oficial) ---
  WHATSAPP_VERIFY_TOKEN: z.string().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  WHATSAPP_APP_SECRET: z.string().default(""),
  WHATSAPP_API_VERSION: z.string().default("v27.0"),
  WHATSAPP_BR_ADD_NINTH_DIGIT: bool.default(true),
  WHATSAPP_API_BASE_URL: z.string().url().default("https://graph.facebook.com"),

  // --- LLM (qualquer API compatível com OpenAI) ---
  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LLM_MAX_CONCURRENCY: z.coerce.number().int().positive().default(4),

  // --- Comportamento do bot ---
  MENU_ENABLED: bool.default(true),
  BOT_NAME: z.string().default("Assistente"),
  BUSINESS_NAME: z.string().default("Clínica Sorriso Exemplo"),
  KNOWLEDGE_FILE: z.string().default("knowledge/faq.json"),
  KNOWLEDGE_TOP_K: z.coerce.number().int().positive().default(3),
  MEMORY_MAX_TURNS: z.coerce.number().int().positive().default(10),
  MEMORY_TTL_MINUTES: z.coerce.number().positive().default(120),

  HANDOFF_KEYWORDS: z
    .string()
    .default("atendente,humano,falar com uma pessoa,falar com alguem,pessoa real")
    .transform(csv),
  HANDOFF_RESUME_KEYWORDS: z.string().default("/bot,voltar ao bot").transform(csv),
  HANDOFF_TTL_MINUTES: z.coerce.number().positive().default(240),
  HANDOFF_NOTIFY_NUMBER: z.string().default(""),

  RATE_LIMIT_MAX_MESSAGES: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().positive().default(60),

  // --- Automação de formulário (Playwright) ---
  FORM_CONFIG_FILE: z.string().default("examples/form-demo/form.config.json"),
  FORM_ENABLED: bool.default(true),
  FORM_HEADLESS: bool.default(true),
  SERVE_DEMO_FORM: bool.default(true),
  PUBLIC_BASE_URL: z.string().default("http://localhost:3000"),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuração inválida (.env):\n${details}`);
  }
  return parsed.data;
}

/** O LLM só é usado se houver chave configurada; senão o bot responde só com a base de conhecimento. */
export const hasLlm = (config: AppConfig) => config.LLM_API_KEY.length > 0;
export const hasWhatsApp = (config: AppConfig) =>
  config.WHATSAPP_ACCESS_TOKEN.length > 0 && config.WHATSAPP_PHONE_NUMBER_ID.length > 0;
