import type { FormField } from "./types.js";
import { normalize } from "../util/text.js";

export type Validation = { ok: true; value: string } | { ok: false; error: string };

const SKIP_WORDS = new Set(["nao", "não", "nenhuma", "nenhum", "pular", "-", "n/a", "sem observacoes"]);

export function validateField(field: FormField, raw: string, now: Date = new Date()): Validation {
  const text = raw.trim();

  if (!field.required && SKIP_WORDS.has(normalize(text))) return { ok: true, value: "" };
  if (!text) return field.required ? { ok: false, error: "Esse campo é obrigatório." } : { ok: true, value: "" };

  if (field.pattern && !new RegExp(field.pattern).test(text)) {
    return { ok: false, error: `Formato inválido para ${field.label.toLowerCase()}.` };
  }

  switch (field.type) {
    case "email": {
      const email = text.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
        ? { ok: true, value: email }
        : { ok: false, error: "Esse e-mail não parece válido. Pode conferir?" };
    }
    case "phone": {
      let digits = text.replace(/\D/g, "");
      if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
      if (digits.length < 10 || digits.length > 11) {
        return { ok: false, error: "Informe o telefone com DDD, ex.: (11) 99999-8888." };
      }
      return { ok: true, value: digits };
    }
    case "date": {
      const iso = parseBrazilianDate(text);
      if (!iso) return { ok: false, error: "Use o formato DD/MM/AAAA, ex.: 25/12/2026." };
      const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      if (new Date(`${iso}T00:00:00Z`) < today) {
        return { ok: false, error: "Essa data já passou. Informe uma data a partir de hoje." };
      }
      return { ok: true, value: iso };
    }
    case "select": {
      const wanted = normalize(text);
      const options = field.options ?? [];
      const match =
        options.find((o) => normalize(o.label) === wanted || normalize(o.value) === wanted) ??
        options.find((o) => normalize(o.label).includes(wanted) || wanted.includes(normalize(o.label)));
      return match
        ? { ok: true, value: match.value }
        : { ok: false, error: `Opção inválida. Escolha entre: ${options.map((o) => o.label).join(", ")}.` };
    }
    case "text": {
      return text.length < 2
        ? { ok: false, error: "Resposta muito curta." }
        : { ok: true, value: text.slice(0, 200) };
    }
    case "textarea":
      return { ok: true, value: text.slice(0, 1000) };
  }
}

/** "25/12/2026" | "25-12-26" | "25/12" (ano corrente) -> "2026-12-25" ou null */
export function parseBrazilianDate(text: string, now: Date = new Date()): string | null {
  const match = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : now.getFullYear();
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Valor legível para o resumo de confirmação. */
export function displayValue(field: FormField, value: string): string {
  if (!value) return "—";
  if (field.type === "date") return value.split("-").reverse().join("/");
  if (field.type === "select") return field.options?.find((o) => o.value === value)?.label ?? value;
  if (field.type === "phone") {
    return value.length === 11
      ? `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`
      : `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
  }
  return value;
}
