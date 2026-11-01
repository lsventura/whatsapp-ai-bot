import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import type { Logger } from "../util/logger.js";
import { Semaphore } from "../util/concurrency.js";
import type { FormConfig, FormField, FormSubmitter, FormValues, SubmitResult } from "./types.js";

export interface PlaywrightSubmitterOptions {
  headless: boolean;
  /** valor substituído em `${PUBLIC_BASE_URL}` dentro de form.url */
  baseUrl: string;
  logger: Logger;
  maxParallel?: number;
  timeoutMs?: number;
}

export function resolveFormUrl(url: string, baseUrl: string): string {
  return url.replace("${PUBLIC_BASE_URL}", baseUrl.replace(/\/+$/, ""));
}

/** Abre o formulário num Chromium, preenche cada campo pelo seletor CSS e envia. */
export class PlaywrightFormSubmitter implements FormSubmitter {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private readonly gate: Semaphore;

  constructor(private readonly opts: PlaywrightSubmitterOptions) {
    this.gate = new Semaphore(opts.maxParallel ?? 2);
  }

  async submit(config: FormConfig, values: FormValues): Promise<SubmitResult> {
    return this.gate.run(() => this.doSubmit(config, values));
  }

  async close(): Promise<void> {
    const browser = this.browser ?? (await this.launching?.catch(() => null)) ?? null;
    this.browser = null;
    this.launching = null;
    await browser?.close();
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.launching ??= chromium.launch({ headless: this.opts.headless }).then((b) => {
      this.browser = b;
      return b;
    });
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  private async doSubmit(config: FormConfig, values: FormValues): Promise<SubmitResult> {
    const timeout = this.opts.timeoutMs ?? 15_000;
    let context;
    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({ locale: "pt-BR" });
      const page = await context.newPage();
      page.setDefaultTimeout(timeout);

      await page.goto(resolveFormUrl(config.url, this.opts.baseUrl), { waitUntil: "domcontentloaded" });

      for (const field of config.fields) {
        const value = values[field.name];
        if (!value) continue;
        await fillField(page, field, value);
      }

      await page.click(config.submitSelector);
      await page.waitForSelector(config.successSelector, { state: "visible" });

      const confirmation = config.successTextSelector
        ? (await page.textContent(config.successTextSelector))?.trim()
        : undefined;
      return { ok: true, confirmation };
    } catch (error) {
      this.opts.logger.error({ err: error, form: config.id }, "falha ao enviar formulário");
      return { ok: false, error: (error as Error).message };
    } finally {
      await context?.close().catch(() => undefined);
    }
  }
}

async function fillField(
  page: Page,
  field: FormField,
  value: string,
): Promise<void> {
  if (field.type === "select") {
    await page.selectOption(field.selector, value);
  } else {
    await page.fill(field.selector, value);
  }
}
