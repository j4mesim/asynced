import { newPromisePair } from "./internal.js";
import { validish } from "./simple.js";

type Waiter<T> = {
  resolve: (value: T | Promise<T>) => void;
  reject: (reason?: unknown) => void;
};

type EnqueueWaiter<T> = {
  value: T | Promise<T>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
};

export class AsyncQueue<T> {
  private promises: Promise<T>[];
  private waiters: Set<Waiter<T>>;
  private enqueuers: EnqueueWaiter<T>[];
  private _closed = false;
  private maxSize?: number;

  constructor(options?: { signal?: AbortSignal; maxSize?: number }) {
    this.waiters = new Set();
    this.promises = [];
    this.enqueuers = [];
    this._closed = false;
    this.maxSize = options?.maxSize;

    if (options?.signal) {
      if (options.signal.aborted) {
        this._closed = true;
      } else {
        options.signal.addEventListener(
          "abort",
          () => {
            this._closed = true;
            this.waiters.forEach((waiter) =>
              waiter.reject(options.signal?.reason),
            );
            this.waiters.clear();
            this.enqueuers.forEach((enqueuer) =>
              enqueuer.reject(options.signal?.reason),
            );
            this.enqueuers = [];
          },
          { once: true },
        );
      }
    }
  }

  get closed() {
    return this._closed;
  }

  close() {
    if (this._closed) throw new Error("Cannot close a queue more than once.");
    this._closed = true;
  }

  async enqueue(t: Promise<T> | T) {
    if (this._closed) throw new Error("Cannot add to closed queue.");

    if (validish(this.maxSize) && this.promises.length >= this.maxSize) {
      await new Promise<void>((resolve, reject) => {
        this.enqueuers.push({ value: t, resolve, reject });
      });
      return;
    }

    const waiter: Waiter<T> | undefined = this.waiters.values().next().value;
    if (waiter) {
      this.waiters.delete(waiter);
      waiter.resolve(t);
    } else {
      const pair = newPromisePair<T>();
      this.promises.push(pair.promise);
      pair.resolve(t);
    }
  }

  private _processNextEnqueuer() {
    const enqueuer = this.enqueuers.shift();
    if (!enqueuer) return;

    const pair = newPromisePair<T>();
    this.promises.push(pair.promise);
    pair.resolve(enqueuer.value);
    enqueuer.resolve();
  }

  async dequeue(options?: { signal?: AbortSignal }) {
    const signal = options?.signal;
    if (signal?.aborted) throw new Error(signal.reason);

    const promise = this.promises.shift();
    if (promise) {
      this._processNextEnqueuer();
      return promise;
    }

    const { promise: pairPromise, ...waiter } = newPromisePair<T>();
    this.waiters.add(waiter);

    if (signal) {
      const onAbort = () => {
        if (this.waiters.delete(waiter)) {
          waiter.reject(signal.reason);
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      pairPromise.finally(() => signal.removeEventListener("abort", onAbort));
    }

    return pairPromise;
  }

  empty() {
    return !this.size;
  }

  blocked() {
    return !!this.waiters.size;
  }

  get size() {
    return this.promises.length - this.waiters.size;
  }

  [Symbol.asyncIterator](options?: {
    signal?: AbortSignal;
  }): AsyncIterableIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        if (options?.signal?.aborted) {
          throw options.signal.reason;
        }

        if (this._closed && this.empty()) {
          return { done: true, value: undefined };
        }

        return {
          done: false,
          value: await this.dequeue(options),
        };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}
