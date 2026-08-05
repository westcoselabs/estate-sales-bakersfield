export interface TestSchemaLifecycle<T> {
  readonly create: () => Promise<void>;
  readonly migrate: () => Promise<void> | void;
  readonly run: () => Promise<T>;
  readonly drop: () => Promise<void>;
}

/**
 * Own one disposable schema from creation through cleanup. Cleanup runs after
 * command success, command failure, and signal-driven child termination.
 */
export async function runTestSchemaLifecycle<T>(
  lifecycle: TestSchemaLifecycle<T>,
): Promise<T> {
  let created = false;
  try {
    await lifecycle.create();
    created = true;
    await lifecycle.migrate();
    return await lifecycle.run();
  } finally {
    if (created) await lifecycle.drop();
  }
}
