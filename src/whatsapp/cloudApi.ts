import type { MessageSender } from "../types.js";

export interface CloudApiOptions {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  baseUrl: string;
  /** Brasil: o webhook às vezes traz o celular sem o 9 (55 11 8888-7777). Reinsere o 9 ao enviar. */
  brAddNinthDigit?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * Celular BR com 12 dígitos (55 + DDD + 8 dígitos começando em 6-9) vira 13 dígitos com o 9.
 * Sem isso, o número de teste da Meta recusa o envio (erro 131030, destinatário fora da lista),
 * porque a lista de destinatários guarda o número com o 9.
 */
export function normalizeBrMobile(to: string): string {
  const digits = to.replace(/\D/g, "");
  if (/^55\d{2}[6-9]\d{7}$/.test(digits)) return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  return digits || to;
}

/** Envio de mensagens pela WhatsApp Business Cloud API (oficial, da Meta). */
export class CloudApiSender implements MessageSender {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: CloudApiOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: this.opts.brAddNinthDigit === false ? to : normalizeBrMobile(to),
      type: "text",
      text: { preview_url: false, body: text },
    });
  }

  async markRead(messageId: string): Promise<void> {
    await this.post({ messaging_product: "whatsapp", status: "read", message_id: messageId });
  }

  private async post(body: unknown): Promise<void> {
    const url = `${this.opts.baseUrl}/${this.opts.apiVersion}/${this.opts.phoneNumberId}/messages`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.opts.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`WhatsApp Cloud API HTTP ${response.status}: ${detail}`);
    }
  }
}

/** Sender de console — usado em `npm run chat` e quando o WhatsApp não está configurado. */
export class ConsoleSender implements MessageSender {
  constructor(private readonly write: (line: string) => void = console.log) {}
  async sendText(to: string, text: string): Promise<void> {
    this.write(`[bot → ${to}] ${text}`);
  }
}
