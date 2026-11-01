import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Router } from "express";

export interface DemoSubmission {
  protocolo: string;
  receivedAt: string;
  data: Record<string, string>;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "form-demo");

/**
 * Formulário local de exemplo (GET /demo-form) + endpoint que o recebe (POST /demo-form/submit).
 * Serve de alvo para o módulo Playwright; fica em memória (últimos 100 envios, só para demonstração).
 */
export function createDemoFormRouter(): { router: Router; submissions: DemoSubmission[] } {
  const router = express.Router();
  const submissions: DemoSubmission[] = [];

  router.get("/demo-form", (_req, res) => {
    res.sendFile(join(dir, "index.html"));
  });

  router.post("/demo-form/submit", express.json({ limit: "20kb" }), (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, string> = {};
    for (const key of ["nome", "email", "telefone", "servico", "data", "observacoes"]) {
      data[key] = typeof body[key] === "string" ? (body[key] as string).trim() : "";
    }
    for (const required of ["nome", "email", "telefone", "servico", "data"]) {
      if (!data[required]) {
        res.status(400).json({ error: `Campo obrigatório: ${required}` });
        return;
      }
    }
    const protocolo = `AGD-${randomUUID().slice(0, 8).toUpperCase()}`;
    submissions.push({ protocolo, receivedAt: new Date().toISOString(), data });
    if (submissions.length > 100) submissions.shift();
    res.status(201).json({ protocolo });
  });

  return { router, submissions };
}
