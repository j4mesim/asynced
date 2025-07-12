import { newPromisePair } from "../internal";

export class Mutex {
  private locked = false;
  private waitingResolvers: (() => void)[] = [];

  release() {
    this.locked = false;
    const wakeup = this.waitingResolvers.shift();
    if (wakeup) {
      this.locked = true;
      wakeup();
    }
  }

  async acquire() {
    // When no locks present or waiting, acquire immediately
    if (!this.locked && !this.waitingResolvers.length) {
      this.locked = true;
      return () => this.release();
    }

    // Register this caller as waiting
    const caller = newPromisePair<void>();
    this.waitingResolvers.push(caller.resolve);

    // Wait to be woken up
    await caller.promise;

    // return release func
    return () => this.release();
  }

  get isLocked() {
    return this.locked;
  }

  async run<T>(callback: () => Promise<T>) {
    await this.acquire();
    let err: unknown;
    try {
      return await callback();
    } catch (error) {
      err = error;
    } finally {
      this.release();
      if (err) throw err;
    }

    // Fix the type inference from potentially returning Promise<T | undefined>.
    // It will either return data of type T or throw and Error
    return null as unknown as T;
  }
}
