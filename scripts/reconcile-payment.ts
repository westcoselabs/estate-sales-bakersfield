import { createConfiguredPaymentService } from "../src/modules/payments";

const argument = process.argv.find((value) => value.startsWith("--attempt="));
const attemptId = argument?.slice("--attempt=".length);
const service = createConfiguredPaymentService();

if (attemptId) {
  const result = await service.reconcileAttempt(attemptId);
  process.stdout.write(
    `${JSON.stringify({ disposition: result.disposition, canonicalPath: result.canonicalPath })}\n`,
  );
} else {
  const enqueued = await service.enqueueReconciliationCandidates(100);
  process.stdout.write(`${JSON.stringify({ enqueued })}\n`);
}
