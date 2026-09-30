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

/** A single producer closes the queue; abort wakes every waiter. */
class PhotoQueue<T> {
  private items: T[] = [];
  private waiters: Array<() => void> = [];
  private closed = false;
  push(item: T) {
    this.items.push(item);
    this.waiters.shift()?.();
  }
  close() {
    this.closed = true;
    this.waiters.splice(0).forEach((wake) => wake());
  }
  async take(signal: AbortSignal): Promise<T | undefined> {
    while (true) {
      signal.throwIfAborted();
      if (this.items.length) return this.items.shift();
      if (this.closed) return undefined;
      await new Promise<void>((resolve) => {
        const wake = () => {
          signal.removeEventListener("abort", wake);
          this.waiters = this.waiters.filter((waiter) => waiter !== wake);
          resolve();
        };
        this.waiters.push(wake);
        signal.addEventListener("abort", wake, { once: true });
        if (signal.aborted) wake();
      });
    }
  }
}

export async function runStagedPhotoUploadPipeline<I, P, R, T>(
  items: readonly I[],
  options: {
    readonly signal: AbortSignal;
    readonly prepare: (item: I) => Promise<P>;
    readonly reserve: (item: P) => Promise<R>;
    readonly transfer: (item: R) => Promise<T>;
    readonly finalize: (item: T) => Promise<void>;
    readonly failed: (item: I, error: unknown) => void;
  },
): Promise<void> {
  const { signal } = options;
  const prepared = new PhotoQueue<{ original: I; value: P }>();
  const transferred = new PhotoQueue<{ original: I; value: T }>();
  const preparedSlots = new PhotoQueue<true>();
  const pendingSlots = new PhotoQueue<true>();
  for (let index = 0; index < 4; index++) preparedSlots.push(true);
  for (let index = 0; index < 8; index++) pendingSlots.push(true);
  const reserve = createPhotoMutationQueue();
  const preparation = (async () => {
    try {
      for (const original of items) {
        await preparedSlots.take(signal);
        try {
          prepared.push({ original, value: await options.prepare(original) });
        } catch (error) {
          preparedSlots.push(true);
          if (signal.aborted) throw error;
          options.failed(original, error);
        }
      }
    } finally {
      prepared.close();
    }
  })();
  const uploads = Array.from({ length: 4 }, async () => {
    while (true) {
      const item = await prepared.take(signal);
      if (!item) return;
      let ownsPending = false;
      let releasedPrepared = false;
      try {
        // FIFO invocation reserves in selection order, independent of completion.
        const reserved = await reserve(() => options.reserve(item.value));
        await pendingSlots.take(signal);
        ownsPending = true;
        preparedSlots.push(true);
        releasedPrepared = true;
        transferred.push({
          original: item.original,
          value: await options.transfer(reserved),
        });
        ownsPending = false; // the finalizer now owns the slot
      } catch (error) {
        if (signal.aborted) throw error;
        options.failed(item.original, error);
      } finally {
        if (!releasedPrepared) preparedSlots.push(true);
        if (ownsPending) pendingSlots.push(true);
      }
    }
  });
  const uploading = Promise.allSettled(uploads).then((results) => {
    transferred.close();
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  });
  const finishing = Array.from({ length: 2 }, async () => {
    while (true) {
      const item = await transferred.take(signal);
      if (!item) return;
      try {
        await options.finalize(item.value);
      } catch (error) {
        if (signal.aborted) throw error;
        options.failed(item.original, error);
      } finally {
        pendingSlots.push(true);
      }
    }
  });
  const results = await Promise.allSettled([
    preparation,
    uploading,
    ...finishing,
  ]);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}

export function waitForPhotoRetry(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Canceled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function waitForPhotoConnection(
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (typeof navigator === "undefined" || navigator.onLine) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("online", online);
      signal.removeEventListener("abort", abort);
    };
    const online = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    window.addEventListener("online", online, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else if (navigator.onLine) online();
  });
}
