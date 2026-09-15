import { checkReleaseConfiguration } from "./release-config";

const stage = process.argv[2] ?? "preparation";
if (
  !["preparation", "public-launch"].includes(stage) ||
  process.argv.length > 3
) {
  process.stderr.write(
    "Usage: tsx scripts/check-release-config.ts [preparation|public-launch]\n",
  );
  process.exitCode = 1;
} else {
  const result = checkReleaseConfiguration(
    process.env,
    stage as "preparation" | "public-launch",
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.configuration === "pass" ? 0 : 1;
}
