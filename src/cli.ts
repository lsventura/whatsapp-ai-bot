/**
 * Chat de terminal para testar o bot SEM WhatsApp: `npm run chat`.
 * Usa exatamente o mesmo pipeline (KB, memória, handoff, formulário, LLM).
 * Para o formulário funcionar, ele sobe o formulário demo local.
 */
import { createInterface } from "node:readline/promises";
import { buildBot } from "./app.js";
import { loadConfig } from "./config.js";
import { createDemoFormRouter } from "./demoForm.js";
import { loadDotEnv } from "./env.js";
import { createServer } from "./server.js";
import { createLogger } from "./util/logger.js";
import { ConsoleSender } from "./whatsapp/cloudApi.js";

loadDotEnv();
const config = loadConfig();
const logger = createLogger(process.env.LOG_LEVEL ?? "warn");
const contact = "5511999990000";

const built = buildBot(config, new ConsoleSender((line) => console.log(`\n${line}\n`)), logger);

const app = createServer({
  bot: built.bot,
  logger,
  verifyToken: "x",
  appSecret: "",
  extraRouters: config.SERVE_DEMO_FORM ? [createDemoFormRouter().router] : [],
});
const server = app.listen(config.PORT);

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "você> " });
console.log("Chat de teste — digite sua mensagem (Ctrl+C / Ctrl+D para sair).\n");
if (process.stdin.isTTY) rl.prompt();

let counter = 0;
// `for await` funciona tanto interativo quanto com entrada via pipe (echo "oi" | npm run chat)
for await (const raw of rl) {
  const line = raw.trim();
  if (line) {
    await built.bot.handleIncoming({ id: `cli-${++counter}`, from: contact, type: "text", text: line });
  }
  if (process.stdin.isTTY) rl.prompt();
}

server.close();
await built.shutdown();
