import type { KnowledgeEntry } from "./knowledge/knowledgeBase.js";
import { normalize } from "./util/text.js";

const GREETINGS = ["oi", "ola", "oie", "bom dia", "boa tarde", "boa noite", "e ai", "eai", "opa", "hello", "hi"];
const MENU_WORDS = ["menu", "inicio", "opcoes", "ajuda"];

/** Mensagem é só um cumprimento ("oi", "bom dia!", "olá, tudo bem?")? */
export function isGreeting(text: string): boolean {
  const n = normalize(text).replace(/\b(tudo bem|tudo bom|td bem|blz|beleza)\b/g, "").trim();
  return GREETINGS.includes(n);
}

export function isMenuRequest(text: string): boolean {
  return MENU_WORDS.includes(normalize(text));
}

/** "2", "2.", "opção 2" → 2 */
export function parseChoice(text: string): number | null {
  const m = normalize(text).match(/^(?:opcao\s*)?(\d{1,2})$/);
  return m ? Number(m[1]) : null;
}

export interface MenuOptions {
  businessName: string;
  entries: KnowledgeEntry[];
  /** frase que dispara o formulário (ex.: "quero agendar"); omitida se não houver formulário */
  formTrigger?: string;
}

/** Menu numerado montado a partir da base de conhecimento (usado no modo sem LLM). */
export function buildMenu(opts: MenuOptions): string {
  const lines = opts.entries.map((e, i) => `*${i + 1}* - ${e.title}`);
  const extras: string[] = [];
  if (opts.formTrigger) extras.push(`Para agendar, digite *${opts.formTrigger}*.`);
  extras.push("Para falar com uma pessoa, digite *atendente*.");
  return [
    `Olá! Aqui é o atendimento da ${opts.businessName}. Responda com o número do assunto:`,
    "",
    ...lines,
    "",
    ...extras,
  ].join("\n");
}
