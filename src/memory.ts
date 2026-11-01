import type { ChatMessage } from "./llm/types.js";

export interface HandoffState {
  active: boolean;
  since: number;
}

export interface Session {
  contactId: string;
  name?: string;
  history: ChatMessage[];
  handoff: HandoffState | null;
  /** Estado da coleta de formulário (módulo forms) — opaco para a memória. */
  formState: unknown;
  lastActivity: number;
}

/** Memória de conversa por contato, em RAM, com TTL e janela de turnos. */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly maxTurns: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(contactId: string): Session {
    const t = this.now();
    let session = this.sessions.get(contactId);
    if (session && t - session.lastActivity > this.ttlMs) {
      // conversa expirada: zera o histórico, mas mantém handoff ativo (humano ainda atendendo)
      session = { ...this.fresh(contactId), name: session.name, handoff: session.handoff };
      this.sessions.set(contactId, session);
    }
    if (!session) {
      session = this.fresh(contactId);
      this.sessions.set(contactId, session);
    }
    session.lastActivity = t;
    return session;
  }

  addMessage(contactId: string, message: ChatMessage): void {
    const session = this.get(contactId);
    session.history.push(message);
    // 1 turno = pergunta + resposta
    const max = this.maxTurns * 2;
    if (session.history.length > max) session.history.splice(0, session.history.length - max);
  }

  reset(contactId: string): void {
    this.sessions.delete(contactId);
  }

  sweep(): void {
    const t = this.now();
    for (const [id, session] of this.sessions) {
      if (t - session.lastActivity > this.ttlMs && !session.handoff?.active) {
        this.sessions.delete(id);
      }
    }
  }

  get size(): number {
    return this.sessions.size;
  }

  private fresh(contactId: string): Session {
    return {
      contactId,
      history: [],
      handoff: null,
      formState: null,
      lastActivity: this.now(),
    };
  }
}
