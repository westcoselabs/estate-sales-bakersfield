import { benchmarkArgon2 } from "../src/modules/auth/infrastructure/argon2-benchmark";

process.stdout.write(`${JSON.stringify(await benchmarkArgon2())}\n`);
