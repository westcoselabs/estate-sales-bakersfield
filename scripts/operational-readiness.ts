export async function inspectOperationalReadiness(
  appUrl: string,
  secret: string,
  fetcher: typeof fetch = fetch,
) {
  const origin = new URL(appUrl);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    secret.trim().length < 16
  ) {
    throw new Error(
      "Configure an HTTPS application origin and a worker authorization secret.",
    );
  }
  const results = [];
  for (const [route, expected] of [
    ["/api/health", "ok"],
    ["/api/internal/readiness", "ready"],
  ] as const) {
    try {
      const response = await fetcher(new URL(route, origin), {
        headers: route.includes("internal")
          ? { authorization: `Bearer ${secret}` }
          : {},
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json();
      const warnings = body.warnings;
      const keys = [
        "deadJobs",
        "failedResendWebhooks",
        "manualReviewPayments",
        "blockedPaidPayments",
        "overdueJobs",
      ];
      const countsValid =
        expected === "ok" ||
        (warnings &&
          keys.every(
            (key) => Number.isSafeInteger(warnings[key]) && warnings[key] === 0,
          ));
      results.push({
        route,
        httpStatus: response.status,
        pass: response.ok && body.status === expected && Boolean(countsValid),
        warningCounts:
          expected === "ready" && warnings
            ? Object.fromEntries(
                keys.map((key) => [
                  key,
                  Number.isSafeInteger(warnings[key])
                    ? warnings[key]
                    : "invalid",
                ]),
              )
            : {},
      });
    } catch {
      results.push({ route, httpStatus: 0, pass: false, warningCounts: {} });
    }
  }
  return {
    status: results.every((item) => item.pass) ? "ready" : "needs-attention",
    checks: results,
  };
}
