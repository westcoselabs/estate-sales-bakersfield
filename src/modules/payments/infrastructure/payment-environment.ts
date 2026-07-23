import type { ServerEnvironment } from "@/platform/config/env";

export function usesDeterministicStripe(
  environment: Pick<ServerEnvironment, "APP_ENV">,
): boolean {
  return environment.APP_ENV === "local" || environment.APP_ENV === "test";
}
