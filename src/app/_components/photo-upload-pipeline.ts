/** Serialize changes to a draft's version while allowing file transfers to overlap. */
export function createPhotoMutationQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}

/** Each file can finish as soon as it arrives; there is no whole-batch barrier. */
export async function runPhotoUploadPipeline<T>(
  items: readonly T[],
  options: {
    readonly concurrency: number;
    readonly signal: AbortSignal;
    readonly process: (item: T) => Promise<void>;
  },
): Promise<void> {
  let next = 0;
  const count = Math.min(
    items.length,
    Math.max(1, Math.floor(options.concurrency)),
  );
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (next < items.length && !options.signal.aborted) {
        const item = items[next++];
        if (item !== undefined) await options.process(item);
      }
    }),
  );
}
