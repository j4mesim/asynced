import { newPromisePair } from "./internal.js";

type Waiter<T> = {
  resolve: (value: T | Promise<T>) => void;
  reject: (reason?: unknown) => void;
};

export class AsyncQueue<T> {
  private promises: Promise<T>[];
  private waiters: Set<Waiter<T>>;
  private _closed = false;

  constructor(options?: { signal?: AbortSignal }) {
    this.waiters = new Set();
    this.promises = [];
    this._closed = false;

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
          },
          { once: true },
        );
      }
    }
  }

  close() {
    if (this._closed) throw new Error("Cannot close a queue more than once.");
    this._closed = true;
  }

  async enqueue(t: Promise<T> | T) {
    if (this._closed) throw new Error("Cannot add to closed queue.");
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

  async dequeue(options?: { signal?: AbortSignal }) {
    const signal = options?.signal;
    if (signal?.aborted) throw new Error(signal.reason);

    const promise = this.promises.shift();
    if (promise) return promise;

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

    return promise;
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

  [Symbol.asyncIterator](options?: { signal?: AbortSignal }) {
    // TODO: Use AsyncIterator.from
    return {
      next: async () => {
        if (options?.signal?.aborted) {
          return Promise.reject(options.signal.reason);
        }
        return this.dequeue(options).then((value) => ({
          done: this.empty() && this._closed,
          value,
        }));
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}
