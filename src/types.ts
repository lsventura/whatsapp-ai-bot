export interface IncomingMessage {
  /** id da mensagem no WhatsApp (wamid...) — usado para deduplicar reenvios do webhook */
  id: string;
  /** número do contato (wa_id) */
  from: string;
  name?: string;
  /** texto da mensagem; undefined para mídia/áudio/etc. */
  text?: string;
  type: string;
}

export interface MessageSender {
  sendText(to: string, text: string): Promise<void>;
  markRead?(messageId: string): Promise<void>;
}
