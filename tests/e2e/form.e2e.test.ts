/**
 * Teste ponta a ponta REAL: abre o Chromium (Playwright), preenche o formulário demo local
 * e confere que o servidor recebeu os dados. Requer `npx playwright install chromium`.
 */
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoFormRouter } from "../../src/demoForm.js";
import { PlaywrightFormSubmitter } from "../../src/forms/playwrightSubmitter.js";
import { createServer } from "../../src/server.js";
import { createLogger } from "../../src/util/logger.js";
import { formConfig, makeBot } from "../helpers.js";

const browserInstalled = existsSync(chromium.executablePath());

describe.skipIf(!browserInstalled)("Playwright + formulário demo (e2e)", () => {
  let server: Server;
  let base: string;
  let submitter: PlaywrightFormSubmitter;
  const demo = createDemoFormRouter();

  beforeAll(async () => {
    const app = createServer({
      bot: makeBot().bot,
      logger: createLogger("silent"),
      verifyToken: "t",
      appSecret: "",
      extraRouters: [demo.router],
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    submitter = new PlaywrightFormSubmitter({ headless: true, baseUrl: base, logger: createLogger("silent") });
  });

  afterAll(async () => {
    await submitter.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it("preenche e envia o formulário, devolvendo o protocolo", async () => {
    const result = await submitter.submit(formConfig, {
      nome: "Maria da Silva",
      email: "maria@exemplo.com",
      telefone: "11988887777",
      servico: "clareamento",
      data: "2099-03-15",
      observacoes: "Prefiro de manhã",
    });

    expect(result.ok).toBe(true);
    expect(result.confirmation).toMatch(/^AGD-/);
    expect(demo.submissions.at(-1)?.data).toMatchObject({
      nome: "Maria da Silva",
      email: "maria@exemplo.com",
      servico: "clareamento",
      data: "2099-03-15",
      observacoes: "Prefiro de manhã",
    });
  });

  it("envios simultâneos funcionam (contextos isolados)", async () => {
    const before = demo.submissions.length;
    const results = await Promise.all(
      ["Ana", "Bruno", "Carla"].map((nome) =>
        submitter.submit(formConfig, {
          nome,
          email: `${nome.toLowerCase()}@exemplo.com`,
          telefone: "11988887777",
          servico: "limpeza",
          data: "2099-03-15",
        }),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(demo.submissions.length - before).toBe(3);
  });

  it("falha de forma controlada quando o seletor de sucesso não aparece", async () => {
    const broken = { ...formConfig, successSelector: "#nao-existe" };
    const fast = new PlaywrightFormSubmitter({
      headless: true,
      baseUrl: base,
      logger: createLogger("silent"),
      timeoutMs: 1500,
    });
    const result = await fast.submit(broken, {
      nome: "Zé",
      email: "ze@exemplo.com",
      telefone: "11988887777",
      servico: "limpeza",
      data: "2099-03-15",
    });
    await fast.close();
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
