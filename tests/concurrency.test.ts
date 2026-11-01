import { describe, expect, it } from "vitest";
import { KeyedQueue, Semaphore } from "../src/util/concurrency.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("KeyedQueue", () => {
  it("processa em ordem as tarefas da mesma chave", async () => {
    const q = new KeyedQueue();
    const log: string[] = [];
    const a = q.enqueue("x", async () => {
      await sleep(30);
      log.push("1");
    });
    const b = q.enqueue("x", async () => {
      log.push("2");
    });
    await Promise.all([a, b]);
    expect(log).toEqual(["1", "2"]);
  });

  it("roda chaves diferentes em paralelo", async () => {
    const q = new KeyedQueue();
    const log: string[] = [];
    const slow = q.enqueue("a", async () => {
      await sleep(50);
      log.push("a");
    });
    const fast = q.enqueue("b", async () => {
      log.push("b");
    });
    await Promise.all([slow, fast]);
    expect(log).toEqual(["b", "a"]);
  });

  it("uma falha não trava a fila e a chave é limpa", async () => {
    const q = new KeyedQueue();
    await expect(q.enqueue("x", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(q.enqueue("x", async () => "ok")).resolves.toBe("ok");
    await sleep(5);
    expect(q.pendingKeys).toBe(0);
  });
});

describe("Semaphore", () => {
  it("limita a concorrência", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        sem.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await sleep(10);
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});
