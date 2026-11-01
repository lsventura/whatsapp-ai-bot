import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(level: string = "info"): Logger {
  return pino({
    level,
    // nunca registrar tokens/segredos
    redact: ["req.headers.authorization", "*.accessToken", "*.apiKey"],
  });
}
