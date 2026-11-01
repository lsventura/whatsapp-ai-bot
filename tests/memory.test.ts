import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/memory.js";

describe("SessionStore", () => {
  it("mantém histórico separado por contato", () => {
    const store = new SessionStore(5, 60_000);
    store.addMessage("a", { role: "user", content: "oi" });
    store.addMessage("b", { role: "user", content: "olá" });
    expect(store.get("a").history).toHaveLength(1);
    expect(store.get("b").history[0]?.content).toBe("olá");
  });

  it("limita o histórico a N turnos", () => {
    const store = new SessionStore(2, 60_000);
    for (let i = 0; i < 10; i++) store.addMessage("a", { role: "user", content: String(i) });
    expect(store.get("a").history.map((m) => m.content)).toEqual(["6", "7", "8", "9"]);
  });

  it("expira o histórico após o TTL mas preserva o handoff", () => {
    let t = 0;
    const store = new SessionStore(5, 1000, () => t);
    store.addMessage("a", { role: "user", content: "oi" });
    store.get("a").handoff = { active: true, since: 0 };
    t = 5000;
    const session = store.get("a");
    expect(session.history).toEqual([]);
    expect(session.handoff?.active).toBe(true);
  });

  it("sweep remove sessões inativas, exceto as em handoff", () => {
    let t = 0;
    const store = new SessionStore(5, 1000, () => t);
    store.get("a");
    store.get("b").handoff = { active: true, since: 0 };
    t = 5000;
    store.sweep();
    expect(store.size).toBe(1);
  });
});
