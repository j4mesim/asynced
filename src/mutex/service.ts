import { add, isBefore, type Duration } from "date-fns";
import type { WithTimestamp } from "../internal.js";
import { Mutex } from "./single.js";
import { validish } from "../simple.js";

export type LockKey = string | number | symbol;

export interface MutexService {
  acquire(resource: LockKey | LockKey[]): Promise<{
    resources: {
      resource: LockKey;
      at: Date;
      release: () => void;
    };
    release(): void;
  }>;
  release(resource: LockKey | LockKey[]): void;
  run<T>(resource: LockKey | LockKey[], callback: () => Promise<T>): Promise<T>;
}

export class MutexBy implements MutexService {
  private locks: Record<LockKey, WithTimestamp<Mutex>> = Object();

  async acquire(resource: LockKey | LockKey[]) {
    const at = new Date();
    const resources = [
      ...new Set(Array.isArray(resource) ? resource : [resource]),
    ];
    const items = await Promise.all(
      resources.map(async (key) => {
        const cached = this.locks[key] ?? { at, data: new Mutex() };
        cached.at = at;
        this.locks[key] = cached;
        return { resource: key, at, release: await cached.data.acquire() };
      }),
    );

    return {
      resources: items.reduce((agg, item) => ({
        ...agg,
        [item.resource]: item.at,
      })),
      release() {
        items.map(({ release }) => {
          release();
        });
      },
    };
  }

  release(resource: LockKey | LockKey[]) {
    const resources = [
      ...new Set(Array.isArray(resource) ? resource : [resource]),
    ];
    const keysMissing: LockKey[] = [];
    resources.forEach((key) => {
      const cached = this.locks[key];
      if (!cached) keysMissing.push(key);
      else cached.data.release();
    });
    if (keysMissing.length)
      throw new Error(`locks for keys ${resources.join(",")} not found!`);
  }

  async run<T>(resource: LockKey | LockKey[], callback: () => Promise<T>) {
    await this.acquire(resource);
    let err: unknown;
    try {
      return await callback();
    } catch (error) {
      err = error;
    } finally {
      this.release(resource);
      if (err) throw err;
    }

    // Fix the type inference from potentially returning Promise<T | undefined>.
    // It will either return data of type T or throw and Error
    return null as unknown as T;
  }

  prune(ttl: Duration) {
    const entries = Object.entries(this.locks) as [
      LockKey,
      WithTimestamp<Mutex>,
    ][];

    const expiredKeysNullish = entries.map(([key, cached]) => {
      if (cached.data.isLocked) return;
      const expiredAt = add(cached.at, ttl);
      if (isBefore(expiredAt, new Date())) {
        delete this.locks[key];
        return key;
      }
    });

    const expiredKeys = expiredKeysNullish.filter(validish);

    return {
      size: {
        new: entries.length,
        old: entries.length - expiredKeys.length,
        dif: expiredKeys.length,
      },
      expiredKeys: expiredKeys,
    };
  }
}

// export const wrapMutexByWithPrefix = <P extends LockPrefix>(
//   prefix: P,
//   mutexBy: MutexBy,
// ): MutexService => {
//   const asResources = (
//     resource: LockSuffixByPrefix[P] | LockSuffixByPrefix[P][],
//   ) => {
//     const resources = Array.isArray(resource) ? resource : [resource];
//     return resources.map(
//       (resource): LockKey => `${prefix}:${resource}`,
//     );
//   };

//   return {
//     async acquire(resource: LockSuffixByPrefix[P] | LockSuffixByPrefix[P][]) {
//       return mutexBy.acquire(asResources(resource));
//     },
//     release(resource: LockSuffixByPrefix[P] | LockSuffixByPrefix[P][]) {
//       return mutexBy.release(asResources(resource));
//     },

//     async run<T>(
//       resource: LockSuffixByPrefix[P] | LockSuffixByPrefix[P][],
//       callback: () => Promise<T>,
//     ) {
//       return mutexBy.run<T>(asResources(resource), callback);
//     },
//   };
// };
