import { newPromisePair } from "../internal.js";

export class RWMutex {
  private locksRead = 0;
  private lockedWrite = false;
  private waitingReadResolvers: (() => void)[] = [];
  private waitingWriteResolvers: (() => void)[] = [];

  private releaseCommon() {
    if (this.lockedWrite)
      throw new Error(
        `RWMutext.lockedWrite = ${this.lockedWrite} when release() was called`,
      );

    // If locks already acquired for read, don't acquire any more locks
    if (this.locksRead) return;

    // Acquiring write lock over reads if waiting.
    const wakeupWriter = this.waitingWriteResolvers.shift();
    if (wakeupWriter) {
      this.lockedWrite = true;
      wakeupWriter();
      return;
    }

    // Acquire all readers.
    this.locksRead += this.waitingReadResolvers.length;
    this.waitingReadResolvers.forEach((wakeupReader) => {
      wakeupReader();
    });
    this.waitingReadResolvers = [];
  }

  releaseRead() {
    if (this.locksRead <= 0)
      throw new Error(
        `RWMutext.locksRead = ${this.locksRead} when releaseRead() was called`,
      );
    this.locksRead -= 1;
    this.releaseCommon();
  }

  releaseWrite() {
    if (!this.lockedWrite)
      throw new Error(
        `RWMutext.lockedWrite = ${this.lockedWrite} when releaseWrite() was called`,
      );
    this.lockedWrite = false;
    this.releaseCommon();
  }

  async acquireWrite() {
    // Acquire write lock immediately when no locks of any kind are present and
    // no writers were waiting
    if (
      !this.locksRead &&
      !this.lockedWrite &&
      !this.waitingWriteResolvers.length
    ) {
      this.lockedWrite = true;
      return () => this.releaseWrite();
    }

    // Register this writer as waiting
    const waitingWriter = newPromisePair<void>();
    this.waitingWriteResolvers.push(waitingWriter.resolve);

    // Wait to be woken up.
    await waitingWriter.promise;

    // Return a release func
    return () => this.releaseWrite();
  }

  async acquireRead() {
    // Acquire read lock immediately when write locks of any kind are present
    // or waiting
    if (!this.lockedWrite && !this.waitingWriteResolvers.length) {
      this.locksRead += 1;
      return () => this.releaseRead();
    }

    // Register this reader as waiting
    const waitingReader = newPromisePair<void>();
    this.waitingReadResolvers.push(waitingReader.resolve);

    // Wait to be woken up.
    await waitingReader.promise;

    // Return a release func
    return () => this.releaseRead();
  }

  private async runCommon<T>(
    callback: () => Promise<T>,
    acquirePromise: Promise<() => void>,
  ) {
    const release = await acquirePromise;
    let err: unknown;
    try {
      return await callback();
    } catch (error) {
      err = error;
    } finally {
      release();
      if (err) throw err;
    }

    // Fix the type inference from potentially returning Promise<T | undefined>.
    // It will either return data of type T or throw an Error
    return null as unknown as T;
  }

  async runRead<T>(callbackRead: () => Promise<T>) {
    return this.runCommon(callbackRead, this.acquireRead());
  }

  async runWrite<T>(callbackWrite: () => Promise<T>) {
    return this.runCommon(callbackWrite, this.acquireWrite());
  }
}
