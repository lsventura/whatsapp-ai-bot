import type { ChatMessage, ChatModel } from "./types.js";

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  /** injetável para testes */
  fetchImpl?: typeof fetch;
  retries?: number;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Cliente mínimo para /chat/completions — funciona com OpenAI, OpenRouter, Groq, Ollama, vLLM etc. */
export class OpenAICompatibleClient implements ChatModel {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OpenAICompatibleOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(messages: ChatMessage[], options: { json?: boolean } = {}): Promise<string> {
    const attempts = (this.opts.retries ?? 1) + 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.request(messages, options.json ?? false);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof LlmError
            ? error.status === undefined || error.status === 429 || error.status >= 500
            : true;
        if (!retryable || attempt === attempts) break;
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new LlmError("Falha desconhecida no LLM");
  }

  private async request(messages: ChatMessage[], json: boolean): Promise<string> {
    const url = `${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.opts.model,
      temperature: this.opts.temperature,
      messages,
    };
    if (json) body.response_format = { type: "json_object" };

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (error) {
      throw new LlmError(`Erro de rede/timeout ao chamar o LLM: ${(error as Error).message}`);
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new LlmError(`LLM respondeu HTTP ${response.status}: ${detail}`, response.status);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new LlmError("Resposta do LLM veio vazia");
    return content;
  }
}
