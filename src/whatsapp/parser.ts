import type { IncomingMessage } from "../types.js";

interface WebhookMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  button?: { text?: string };
}

interface WebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: WebhookMessage[];
        statuses?: unknown[];
      };
    }>;
  }>;
}

/** Extrai mensagens recebidas do payload do webhook (ignora status de entrega/leitura). */
export function parseWebhook(payload: unknown): IncomingMessage[] {
  const body = payload as WebhookPayload;
  if (body?.object !== "whatsapp_business_account") return [];

  const out: IncomingMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      const names = new Map(
        (value.contacts ?? []).flatMap((c) => (c.wa_id ? [[c.wa_id, c.profile?.name] as const] : [])),
      );
      for (const msg of value.messages) {
        if (!msg.id || !msg.from) continue;
        out.push({
          id: msg.id,
          from: msg.from,
          name: names.get(msg.from),
          type: msg.type ?? "unknown",
          text: extractText(msg),
        });
      }
    }
  }
  return out;
}

function extractText(msg: WebhookMessage): string | undefined {
  switch (msg.type) {
    case "text":
      return msg.text?.body;
    case "button":
      return msg.button?.text;
    case "interactive":
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title;
    default:
      return undefined;
  }
}
