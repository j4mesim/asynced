export const newPromisePair = <T>() => {
  let resolve: (value: T | Promise<T>) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  // We can be sure `resolve` is assigned here.
  return { promise, resolve: resolve! };
};


export interface WithTimestamp<T> {
  data: T;
  at: Date;
}
