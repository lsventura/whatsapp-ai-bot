import { existsSync } from "node:fs";

/** Carrega .env (se existir) usando o suporte nativo do Node — sem dotenv. */
export function loadDotEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
