import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { z } from "zod";
import { tokenize } from "../util/text.js";

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface SearchHit {
  entry: KnowledgeEntry;
  score: number;
}

const jsonSchema = z.array(
  z.object({
    pergunta: z.string().min(1),
    resposta: z.string().min(1),
    tags: z.array(z.string()).optional(),
  }),
);

/** Lê FAQ em JSON ([{pergunta, resposta, tags}]) ou Markdown (cada `## Título` vira uma entrada). */
export function parseKnowledge(raw: string, format: "json" | "md"): KnowledgeEntry[] {
  if (format === "json") {
    return jsonSchema.parse(JSON.parse(raw)).map((item, index) => ({
      id: `faq-${index + 1}`,
      title: item.pergunta,
      content: item.resposta,
      tags: item.tags ?? [],
    }));
  }

  const entries: KnowledgeEntry[] = [];
  let title: string | null = null;
  let body: string[] = [];
  const flush = () => {
    const content = body.join("\n").trim();
    if (title && content) {
      entries.push({ id: `faq-${entries.length + 1}`, title, content, tags: [] });
    }
  };
  for (const line of raw.split(/\r?\n/)) {
    const heading = /^#{2,3}\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      title = heading[1]!.trim();
      body = [];
    } else {
      body.push(line);
    }
  }
  flush();
  return entries;
}

export function loadKnowledgeFile(path: string): KnowledgeEntry[] {
  const raw = readFileSync(path, "utf8");
  const format = extname(path).toLowerCase() === ".json" ? "json" : "md";
  return parseKnowledge(raw, format);
}

/**
 * Busca lexical (BM25 simplificado) — sem dependências nem embeddings.
 * Para bases grandes, troque por busca vetorial mantendo a mesma interface `search()`.
 */
export class KnowledgeBase {
  private readonly docs: Array<{ entry: KnowledgeEntry; terms: Map<string, number>; length: number }>;
  private readonly docFreq = new Map<string, number>();
  private readonly avgLength: number;

  constructor(readonly entries: KnowledgeEntry[]) {
    this.docs = entries.map((entry) => {
      // título e tags pesam mais que o corpo
      const tokens = [
        ...tokenize(entry.title),
        ...tokenize(entry.title),
        ...entry.tags.flatMap(tokenize),
        ...tokenize(entry.content),
      ];
      const terms = new Map<string, number>();
      for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1);
      for (const token of terms.keys()) this.docFreq.set(token, (this.docFreq.get(token) ?? 0) + 1);
      return { entry, terms, length: tokens.length };
    });
    this.avgLength = this.docs.reduce((sum, d) => sum + d.length, 0) / Math.max(1, this.docs.length);
  }

  search(query: string, topK = 3, minScore = 0.5): SearchHit[] {
    const queryTokens = [...new Set(tokenize(query))];
    if (queryTokens.length === 0 || this.docs.length === 0) return [];

    const k1 = 1.4;
    const b = 0.75;
    const n = this.docs.length;
    const hits: SearchHit[] = [];

    for (const doc of this.docs) {
      let score = 0;
      let matched = 0;
      for (const token of queryTokens) {
        const tf = doc.terms.get(token);
        if (!tf) continue;
        matched++;
        const df = this.docFreq.get(token) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * (tf * (k1 + 1))) / (tf + k1 * (1 - b + (b * doc.length) / this.avgLength));
      }
      // exige cobertura mínima: casar só 1 palavra comum de uma pergunta longa não basta
      if (score >= minScore && matched / queryTokens.length >= 0.4) hits.push({ entry: doc.entry, score });
    }

    return hits.sort((a, b2) => b2.score - a.score).slice(0, topK);
  }
}
