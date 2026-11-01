export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatModel {
  complete(messages: ChatMessage[], options?: { json?: boolean }): Promise<string>;
}
