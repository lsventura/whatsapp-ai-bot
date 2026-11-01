import { normalize } from "../util/text.js";
import type { ChatModel } from "../llm/types.js";
import type { FormConfig, FormValues } from "./types.js";
import { displayValue, validateField } from "./validators.js";

export type FormState =
  | { status: "collecting"; values: FormValues; current: string; editing?: boolean }
  | { status: "confirming"; values: FormValues }
  | { status: "choosing-field"; values: FormValues };

export interface DialogResult {
  /** novo estado (null = diálogo encerrado) */
  state: FormState | null;
  reply: string;
  /** preenchido quando o usuário confirmou e o formulário deve ser enviado */
  submit?: FormValues;
}

const YES = new Set(["sim", "s", "ok", "confirmo", "confirmar", "pode enviar", "enviar", "isso", "correto"]);
const NO = new Set(["nao", "n", "corrigir", "errado", "alterar", "mudar"]);
const CANCEL = new Set(["cancelar", "cancela", "sair", "parar", "desistir", "/cancelar"]);

/**
 * Máquina de estados da coleta de campos. É pura (sem I/O) para ser fácil de testar:
 * recebe o estado + mensagem e devolve o novo estado + resposta.
 * Opcionalmente usa um LLM para extrair VÁRIOS campos de uma mensagem livre.
 */
export class FormDialog {
  constructor(
    readonly config: FormConfig,
    private readonly extractor: ChatModel | null = null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  matchesTrigger(text: string): boolean {
    const clean = ` ${normalize(text)} `;
    return this.config.triggers.some((t) => clean.includes(` ${normalize(t)} `));
  }

  async start(firstMessage: string): Promise<DialogResult> {
    const values: FormValues = {};
    if (this.extractor) Object.assign(values, await this.extract(firstMessage, values));

    const intro = `Certo! Vou te ajudar com o *${this.config.title.toLowerCase()}*. Você pode digitar *cancelar* a qualquer momento.`;
    return this.advance(values, intro);
  }

  async handle(state: FormState, text: string): Promise<DialogResult> {
    const clean = normalize(text);

    if (CANCEL.has(clean)) {
      return { state: null, reply: "Tudo bem, cancelei o pedido. Se quiser retomar, é só dizer *quero agendar*." };
    }

    switch (state.status) {
      case "collecting":
        return this.handleAnswer(state, text);

      case "confirming":
        if (YES.has(clean)) {
          return { state: null, reply: "Perfeito! Estou enviando seu pedido… ⏳", submit: state.values };
        }
        if (NO.has(clean)) {
          const list = this.config.fields.map((f, i) => `${i + 1}. ${f.label}`).join("\n");
          return {
            state: { status: "choosing-field", values: state.values },
            reply: `Qual campo você quer corrigir? Responda com o número:\n${list}`,
          };
        }
        return { state, reply: `${this.summary(state.values)}\n\nResponda *sim* para enviar, *não* para corrigir ou *cancelar*.` };

      case "choosing-field": {
        const index = Number(clean) - 1;
        const field = this.config.fields[index];
        if (!field) {
          return { state, reply: `Número inválido. Escolha de 1 a ${this.config.fields.length}.` };
        }
        return {
          state: { status: "collecting", values: state.values, current: field.name, editing: true },
          reply: field.prompt,
        };
      }
    }
  }

  private async handleAnswer(
    state: Extract<FormState, { status: "collecting" }>,
    text: string,
  ): Promise<DialogResult> {
    const field = this.config.fields.find((f) => f.name === state.current);
    if (!field) return this.advance(state.values);

    const result = validateField(field, text, this.now());
    const values = { ...state.values };

    if (result.ok) {
      values[field.name] = result.value;
    } else if (this.extractor && !state.editing) {
      // resposta inválida para o campo atual: talvez o usuário tenha mandado outros dados juntos
      const extracted = await this.extract(text, values);
      if (Object.keys(extracted).length === 0) return { state, reply: `${result.error}\n${field.prompt}` };
      Object.assign(values, extracted);
    } else {
      return { state, reply: `${result.error}\n${field.prompt}` };
    }

    if (state.editing) {
      return { state: { status: "confirming", values }, reply: this.confirmation(values) };
    }
    return this.advance(values);
  }

  private advance(values: FormValues, prefix = ""): DialogResult {
    const next = this.config.fields.find((f) => f.required && !values[f.name]) ??
      this.config.fields.find((f) => values[f.name] === undefined);

    if (!next) {
      return { state: { status: "confirming", values }, reply: this.confirmation(values) };
    }
    const reply = prefix ? `${prefix}\n\n${next.prompt}` : next.prompt;
    return { state: { status: "collecting", values, current: next.name }, reply };
  }

  private confirmation(values: FormValues): string {
    return `${this.summary(values)}\n\nEstá tudo certo? Responda *sim* para enviar ou *não* para corrigir.`;
  }

  private summary(values: FormValues): string {
    const lines = this.config.fields.map((f) => `• *${f.label}:* ${displayValue(f, values[f.name] ?? "")}`);
    return `Confira os dados:\n${lines.join("\n")}`;
  }

  /** Pede ao LLM para extrair campos de uma mensagem livre; valida tudo com os mesmos validadores. */
  private async extract(text: string, already: FormValues): Promise<FormValues> {
    if (!this.extractor) return {};
    const missing = this.config.fields.filter((f) => already[f.name] === undefined);
    const spec = missing
      .map((f) => `- ${f.name} (${f.type}${f.options ? `: ${f.options.map((o) => o.label).join("/")}` : ""}): ${f.label}`)
      .join("\n");
    try {
      const raw = await this.extractor.complete(
        [
          {
            role: "system",
            content:
              "Extraia dados de formulário da mensagem do usuário. Responda SOMENTE um objeto JSON com as chaves " +
              "listadas que estiverem EXPLICITAMENTE na mensagem (omita as demais; nunca invente valores). " +
              `Datas no formato DD/MM/AAAA.\nCampos:\n${spec}`,
          },
          { role: "user", content: text },
        ],
        { json: true },
      );
      const parsed: unknown = JSON.parse(raw.replace(/^```(?:json)?|```$/gm, "").trim());
      if (typeof parsed !== "object" || parsed === null) return {};

      const out: FormValues = {};
      for (const field of missing) {
        const value = (parsed as Record<string, unknown>)[field.name];
        if (typeof value !== "string" || !value.trim()) continue;
        const check = validateField(field, value, this.now());
        if (check.ok) out[field.name] = check.value;
      }
      return out;
    } catch {
      return {}; // extração é "best effort": cai no fluxo pergunta-a-pergunta
    }
  }
}
