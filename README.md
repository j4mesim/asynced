# @j4mesim/asynced

> Async primitives for JavaScript and TypeScript

[![npm version](https://img.shields.io/npm/v/@j4mesim/asynced.svg)](https://www.npmjs.com/package/@j4mesim/asynced)  
[![license](https://img.shields.io/npm/l/@j4mesim/asynced.svg)](LICENSE)  
[![CI (main)](https://github.com/j4mesim/asynced/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/j4mesim/asynced/actions/workflows/ci.yml?query=branch%3Amain)  
[![CI (develop)](https://github.com/j4mesim/asynced/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/j4mesim/asynced/actions/workflows/ci.yml?query=branch%3Adevelop)

A small collection of async concurrency primitives: a backpressure-aware queue, mutex variants, and promise utilities.

## Installation

```bash
npm install @j4mesim/asynced
# or
bun add @j4mesim/asynced
```

## API

- [AsyncQueue](#asyncqueue)
- [Mutex](#mutex)
- [RWMutex](#rwmutex)
- [MutexBy](#mutexby)
- [withEffect / withCatch / withFinally](#witheffect--withcatch--withfinally)
- [sleep](#sleep)
- [validish / invalidish / isdefined](#validish--invalidish--isdefined)

---

### AsyncQueue

A FIFO queue where producers and consumers run at their own pace. Consumers block until an item is available; with `maxSize` set, producers block when the buffer is full.

```ts
import { AsyncQueue } from "@j4mesim/asynced";

const queue = new AsyncQueue<number>();

queue.enqueue(1);
queue.enqueue(2);

await queue.dequeue(); // 1
await queue.dequeue(); // 2
```

#### Backpressure with `maxSize`

When the buffer is full, `enqueue` suspends until a consumer calls `dequeue` and frees a slot. This gives you natural producer/consumer flow control without any manual throttling.

```ts
const queue = new AsyncQueue<string>({ maxSize: 10 });

async function produce() {
  for (const item of items) {
    await queue.enqueue(item); // suspends automatically when full
  }
  queue.close();
}

async function consume() {
  for await (const item of queue) {
    await process(item);
  }
}
```

#### Async iteration

A closed queue drains all buffered items before the iterator ends.

```ts
queue.enqueue("a");
queue.enqueue("b");
queue.close();

for await (const item of queue) {
  console.log(item); // "a", "b"
}
```

#### Abort signal

Pass an `AbortSignal` to cancel blocked consumers or producers.

```ts
const controller = new AbortController();
const queue = new AsyncQueue<number>({ signal: controller.signal });

// or cancel a single dequeue
await queue.dequeue({ signal: controller.signal });
```

#### Constructor options

| Option | Type | Description |
| ------ | ---- | ----------- |
| `maxSize` | `number` | Max buffered items. Producers block when full. |
| `signal` | `AbortSignal` | Cancels all blocked enqueue and dequeue calls. |

#### Instance methods / properties

| Member | Description |
| ------ | ----------- |
| `enqueue(value)` | Add an item. Suspends if buffer is full. |
| `dequeue(options?)` | Remove and return the next item. Suspends if empty. |
| `close()` | Signal that no more items will be enqueued. |
| `size` | Number of buffered items. |
| `empty()` | `true` if no buffered items. |
| `blocked()` | `true` if consumers are waiting on an empty queue. |
| `closed` | `true` after `close()` has been called. |
| `[Symbol.asyncIterator]` | Iterate until the queue is closed and empty. |

---

### Mutex

Exclusive lock for async code. Callers acquire in order and wait if the lock is held.

```ts
import { Mutex } from "@j4mesim/asynced";

const mutex = new Mutex();

// manual acquire / release
const release = await mutex.acquire();
try {
  await doExclusiveWork();
} finally {
  release();
}

// or use run() for automatic release
await mutex.run(async () => {
  await doExclusiveWork();
});
```

| Member | Description |
| ------ | ----------- |
| `acquire()` | Waits for the lock, returns a `release` function. |
| `run(callback)` | Acquires, runs the callback, then releases automatically. |
| `isLocked` | `true` if currently held. |

---

### RWMutex

Readers-writer lock. Multiple readers can hold the lock concurrently; writers get exclusive access. Waiting writers take priority over new readers.

```ts
import { RWMutex } from "@j4mesim/asynced";

const rwmutex = new RWMutex();

// concurrent reads
const releaseRead = await rwmutex.acquireRead();
try {
  await readSharedState();
} finally {
  releaseRead();
}

// exclusive write
const releaseWrite = await rwmutex.acquireWrite();
try {
  await mutateSharedState();
} finally {
  releaseWrite();
}

// or use run helpers
await rwmutex.runRead(async () => readSharedState());
await rwmutex.runWrite(async () => mutateSharedState());
```

| Member | Description |
| ------ | ----------- |
| `acquireRead()` | Waits for read access, returns a `releaseRead` function. |
| `acquireWrite()` | Waits for exclusive write access, returns a `releaseWrite` function. |
| `runRead(callback)` | Acquires read lock, runs callback, releases. |
| `runWrite(callback)` | Acquires write lock, runs callback, releases. |

---

### MutexBy

A keyed mutex service. Each unique resource key gets its own `Mutex`. Pass multiple keys to acquire several locks atomically.

```ts
import { MutexBy } from "@j4mesim/asynced";

const locks = new MutexBy();

// lock a single resource
await locks.run("user:42", async () => {
  await updateUser(42);
});

// lock multiple resources atomically
await locks.run(["account:1", "account:2"], async () => {
  await transfer(1, 2, 100);
});
```

Unused mutexes accumulate over time. Call `prune` periodically to remove locks that are idle and older than a given TTL.

```ts
locks.prune({ minutes: 10 });
```

| Member | Description |
| ------ | ----------- |
| `acquire(resource)` | Acquires lock(s) for the given key(s), returns a `release` function. |
| `run(resource, callback)` | Acquires, runs callback, releases automatically. |
| `prune(ttl)` | Removes idle locks last used before `ttl` ago. |

---

### withEffect / withCatch / withFinally

Attach side-effect callbacks to a promise or async function without altering its resolved value or breaking the error chain.

```ts
import { withEffect, withCatch, withFinally } from "@j4mesim/asynced";

// run a catch and a finally side-effect
const result = await withEffect(fetchData(), {
  catch: (err) => logger.error(err),
  finally: () => metrics.increment("fetch.complete"),
});

// shorthand helpers
await withCatch(fetchData(), (err) => logger.error(err));
await withFinally(fetchData(), () => cleanup());
```

All three accept either a `Promise<T>` or a `() => Promise<T> | T`.

---

### sleep

```ts
import { sleep } from "@j4mesim/asynced";

await sleep(500); // wait 500ms
```

---

### validish / invalidish / isdefined

Lightweight null/undefined guards with TypeScript narrowing.

```ts
import { validish, invalidish, isdefined } from "@j4mesim/asynced";

validish(null)      // false  — narrows away null | undefined
validish("hello")   // true

invalidish(null)    // true   — narrows to null | undefined
invalidish(0)       // false

isdefined(undefined) // false — narrows away undefined only
isdefined(null)      // true
```

## License

MIT
