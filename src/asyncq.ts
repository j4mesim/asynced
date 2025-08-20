import { newPromisePair } from "./internal.js";

export class AsyncQueue<T> {
  private promises: Promise<T>[];
  private resolves: ((value: T | Promise<T>) => void)[];
  private _closed = false;

  constructor() {
    this.resolves = [];
    this.promises = [];
    this._closed = false;
  }

  close() {
    if (this._closed) throw new Error("Cannot close a queue more than once.");
    this._closed = true;
  }

  async enqueue(t: Promise<T> | T) {
    if (this._closed) throw new Error("Cannot add to closed queue.");
    const resolve = this.resolves.shift();
    if (resolve) resolve(t);
    else {
      const pair = newPromisePair<T>();
      this.promises.push(pair.promise);
      pair.resolve(t);
    }
  }
  async dequeue() {
    const promise = this.promises.shift();
    if (promise) return promise;
    const pair = newPromisePair<T>();
    this.resolves.push(pair.resolve);
    return pair.promise;
  }
  empty() {
    return !this.size;
  }
  blocked() {
    return !!this.resolves.length;
  }
  get size() {
    return this.promises.length - this.resolves.length;
  }
  [Symbol.asyncIterator]() {
    // TODO: Use AsyncIterator.from
    return {
      next: () =>
        this.dequeue().then((value) => ({
          done: this.empty() && this._closed,
          value,
        })),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}
