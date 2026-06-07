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

describe("AsyncQueue maxSize", () => {
  test("enqueue blocks when queue is full and unblocks on dequeue", async () => {
    const queue = new AsyncQueue<number>({ maxSize: 2 });

    await queue.enqueue(1);
    await queue.enqueue(2);

    let thirdEnqueued = false;
    const third = queue.enqueue(3).then(() => {
      thirdEnqueued = true;
    });

    // Third enqueue should be blocked — queue is full
    await Promise.resolve();
    expect(thirdEnqueued).toBe(false);

    expect(await queue.dequeue()).toBe(1);

    await third;
    expect(thirdEnqueued).toBe(true);
  });

  test("multiple blocked enqueuers are processed in order", async () => {
    const queue = new AsyncQueue<number>({ maxSize: 1 });

    await queue.enqueue(1);

    const order: number[] = [];
    const p2 = queue.enqueue(2).then(() => order.push(2));
    const p3 = queue.enqueue(3).then(() => order.push(3));

    await Promise.resolve();
    expect(order).toEqual([]);

    expect(await queue.dequeue()).toBe(1);
    await p2;
    expect(order).toEqual([2]);

    expect(await queue.dequeue()).toBe(2);
    await p3;
    expect(order).toEqual([2, 3]);
  });

  test("abort signal rejects blocked enqueuers", async () => {
    const controller = new AbortController();
    const queue = new AsyncQueue<number>({
      maxSize: 1,
      signal: controller.signal,
    });

    await queue.enqueue(1);
    const blocked = queue.enqueue(2);

    controller.abort("cancelled");
    await expect(blocked).rejects.toBe("cancelled");
  });
});
