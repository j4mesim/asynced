export const withEffect = async <T>(
  original: Promise<T> | (() => Promise<T> | T),
  effects: {
    catch?: (err: unknown) => Promise<void> | void;
    finally?: () => Promise<void> | void;
  },
) => {
  let result: T;
  try {
    if (original instanceof Promise) result = await original;
    else {
      const response = original();
      result = response instanceof Promise ? await response : response;
    }
  } catch (e) {
    const caughtPromiseMaybe = effects.catch?.(e);
    if (caughtPromiseMaybe instanceof Promise) await caughtPromiseMaybe;
    throw e;
  } finally {
    const finallyPromiseMaybe = effects.finally?.();
    if (finallyPromiseMaybe instanceof Promise) await finallyPromiseMaybe;
  }
  return result;
};

export const withCatch = async <T>(
  original: Promise<T> | (() => Promise<T> | T),
  catchFunc: (err: unknown) => Promise<void> | void,
) => withEffect(original, { catch: catchFunc });

export const withFinally = async <T>(
  original: Promise<T> | (() => Promise<T> | T),
  finallyFunc?: () => Promise<void> | void,
) => withEffect(original, { finally: finallyFunc });
