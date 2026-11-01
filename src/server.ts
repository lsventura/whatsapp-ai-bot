import express, { type Express, type Request } from "express";
import type { Bot } from "./bot.js";
import type { Logger } from "./util/logger.js";
import { maskPhone } from "./util/phone.js";
import { parseWebhook } from "./whatsapp/parser.js";
import { verifySignature } from "./whatsapp/signature.js";

export interface ServerOptions {
  bot: Bot;
  logger: Logger;
  verifyToken: string;
  /** se vazio, a assinatura NÃO é validada (apenas para desenvolvimento local!) */
  appSecret: string;
  extraRouters?: express.Router[];
}

type RawRequest = Request & { rawBody?: Buffer };

export function createServer(opts: ServerOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  for (const router of opts.extraRouters ?? []) app.use(router);

  // Verificação do webhook (Meta chama uma vez ao cadastrar a URL)
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && opts.verifyToken && token === opts.verifyToken) {
      res.status(200).type("text/plain").send(String(challenge ?? ""));
      return;
    }
    res.sendStatus(403);
  });

  // Recebimento de mensagens. Guardamos o corpo bruto para validar a assinatura HMAC.
  app.post(
    "/webhook",
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        (req as RawRequest).rawBody = Buffer.from(buf);
      },
    }),
    (req: RawRequest, res) => {
      if (opts.appSecret) {
        const ok = req.rawBody
          ? verifySignature(req.rawBody, req.header("x-hub-signature-256"), opts.appSecret)
          : false;
        if (!ok) {
          opts.logger.warn("webhook com assinatura inválida rejeitado");
          res.sendStatus(401);
          return;
        }
      }

      // Responde 200 imediatamente (a Meta reenvia se passar de ~20s) e processa em background.
      res.sendStatus(200);

      for (const message of parseWebhook(req.body)) {
        opts.logger.info(
          { contact: maskPhone(message.from), type: message.type, id: message.id },
          "mensagem recebida",
        );
        void opts.bot.handleIncoming(message);
      }
    },
  );

  return app;
}
