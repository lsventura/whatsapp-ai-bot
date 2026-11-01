import { normalize } from "./util/text.js";

export class HandoffDetector {
  private readonly keywords: string[];
  private readonly resume: string[];

  constructor(keywords: string[], resumeKeywords: string[]) {
    this.keywords = keywords.map(normalize).filter(Boolean);
    this.resume = resumeKeywords.map(normalize).filter(Boolean);
  }

  /** Procura a palavra/frase como termo inteiro, para "humano" não casar com "humanoide". */
  wantsHuman(text: string): boolean {
    const haystack = ` ${normalize(text)} `;
    return this.keywords.some((k) => haystack.includes(` ${k} `));
  }

  wantsBot(text: string): boolean {
    const clean = normalize(text);
    return this.resume.some((k) => clean === k);
  }
}
