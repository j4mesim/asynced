# TODO

- [ ] Implement Backpressure / MaxSize in `AsyncQueue`
    - Add a `maxSize` option to the constructor.
    - Make `enqueue` wait (block) if the queue is full.
    - Ensure `dequeue` resolves those waiting `enqueue` calls when space becomes available.
