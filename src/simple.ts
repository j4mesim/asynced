export const invalidish = (t: unknown): t is null | undefined =>
  t === undefined || t === null;

export const validish = <T>(t: T): t is Exclude<T, undefined | null> =>
  !invalidish(t);

export const isdefined = <T>(t: T): t is Exclude<T, undefined> =>
  t !== undefined;

export const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
