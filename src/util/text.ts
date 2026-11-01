/** Remove acentos, baixa caixa e normaliza espaços. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de do da dos das em no na nos nas por para com sem e ou que se " +
    "eu voce vc ele ela nos vos eles elas meu minha seu sua ao aos pra pro como qual quais " +
    "quando onde quem ha tem ter tenho voces gostaria queria quero saber favor oi ola bom dia " +
    "tarde noite obrigado obrigada mais muito mesmo isso essa esse esta este"
  ).split(" "),
);

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map(stem);
}

/** Stemmer bem simples (plural) — suficiente para casar "horários"/"horario", "preços"/"preco". */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/** Quebra textos longos respeitando parágrafos (limite do WhatsApp: 4096 caracteres). */
export function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    let rest = paragraph;
    while (rest.length > limit) {
      chunks.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    current = rest;
  }
  if (current) chunks.push(current);
  return chunks;
}
