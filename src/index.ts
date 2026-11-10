import { buildBot } from "./app.js";
import { hasWhatsApp, loadConfig } from "./config.js";
import { createDemoFormRouter } from "./demoForm.js";
import { loadDotEnv } from "./env.js";
import { createServer } from "./server.js";
import { createLogger } from "./util/logger.js";
import { CloudApiSender, ConsoleSender } from "./whatsapp/cloudApi.js";

loadDotEnv();
const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

const sender = hasWhatsApp(config)
  ? new CloudApiSender({
      accessToken: config.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
      apiVersion: config.WHATSAPP_API_VERSION,
      baseUrl: config.WHATSAPP_API_BASE_URL,
      brAddNinthDigit: config.WHATSAPP_BR_ADD_NINTH_DIGIT,
    })
  : new ConsoleSender();
if (!hasWhatsApp(config)) {
  logger.warn("WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID ausentes: respostas serão apenas impressas no console");
}
if (!config.WHATSAPP_APP_SECRET) {
  logger.warn("WHATSAPP_APP_SECRET vazio: assinatura do webhook NÃO está sendo validada (use só em desenvolvimento)");
}

const built = buildBot(config, sender, logger);
const extraRouters = config.SERVE_DEMO_FORM ? [createDemoFormRouter().router] : [];

const app = createServer({
  bot: built.bot,
  logger,
  verifyToken: config.WHATSAPP_VERIFY_TOKEN,
  appSecret: config.WHATSAPP_APP_SECRET,
  extraRouters,
});

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info({ host: config.HOST, port: config.PORT }, "servidor no ar — webhook em /webhook, health em /health");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "encerrando…");
  server.close();
  await built.shutdown();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
