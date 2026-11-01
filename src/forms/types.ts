import { z } from "zod";

export const fieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  prompt: z.string().min(1),
  type: z.enum(["text", "email", "phone", "date", "select", "textarea"]).default("text"),
  selector: z.string().min(1),
  required: z.boolean().default(true),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  /** regex opcional extra de validação */
  pattern: z.string().optional(),
});

export const formConfigSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  triggers: z.array(z.string()).min(1),
  /** aceita ${PUBLIC_BASE_URL} */
  url: z.string().min(1),
  fields: z.array(fieldSchema).min(1),
  submitSelector: z.string().min(1),
  successSelector: z.string().min(1),
  successTextSelector: z.string().optional(),
});

export type FormField = z.infer<typeof fieldSchema>;
export type FormConfig = z.infer<typeof formConfigSchema>;
export type FormValues = Record<string, string>;

export interface SubmitResult {
  ok: boolean;
  /** texto lido da página de sucesso (ex.: protocolo) */
  confirmation?: string;
  error?: string;
}

export interface FormSubmitter {
  submit(config: FormConfig, values: FormValues): Promise<SubmitResult>;
}
