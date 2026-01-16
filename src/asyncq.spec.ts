import { expect, test, describe } from "vitest";
import { AsyncQueue } from "./asyncq.js";

describe("AsyncQueue", () => {
  test("should enqueue and dequeue items", async () => {
    const queue = new AsyncQueue<number>();
    queue.enqueue(1);
    queue.enqueue(2);

    expect(await queue.dequeue()).toBe(1);
    expect(await queue.dequeue()).toBe(2);
  });

  test("should wait for items when dequeuing from empty queue", async () => {
    const queue = new AsyncQueue<number>();
    const promise = queue.dequeue();

    queue.enqueue(42);
    expect(await promise).toBe(42);
  });

  test("should iterate over items", async () => {
    const queue = new AsyncQueue<number>();
    queue.enqueue(1);
    queue.enqueue(2);
    queue.close();

    const results: number[] = [];
    for await (const item of queue) {
      results.push(item);
    }

    expect(results).toEqual([1, 2]);
  });

  test("should handle AbortSignal in iterator", async () => {
    const queue = new AsyncQueue<number>();
    const controller = new AbortController();

    const iterator = queue[Symbol.asyncIterator]({ signal: controller.signal });

    controller.abort("reason");

    await expect(iterator.next()).rejects.toBe("reason");
  });
});
