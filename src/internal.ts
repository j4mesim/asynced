export const newPromisePair = <T>() => {
  let resolve: (value: T | Promise<T>) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // We can be sure `resolve` and `reject` are assigned here.
  return { promise, resolve: resolve!, reject: reject! };
};

export interface WithTimestamp<T> {
  data: T;
  at: Date;
}
