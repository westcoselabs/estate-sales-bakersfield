import { stdin, stdout } from "node:process";

import { PrismaNeon } from "@prisma/adapter-neon";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { Argon2PasswordHasher, normalizeEmail } from "../src/modules/auth";

const deploymentEnvironments = new Set([
  "local",
  "test",
  "preview",
  "production",
]);

function provisioningEnvironment(): {
  readonly APP_ENV: string;
  readonly DATABASE_RESOURCE_ENV: string;
  readonly DATABASE_URL: string;
} {
  const appEnvironment = process.env.APP_ENV;
  if (!appEnvironment || !deploymentEnvironments.has(appEnvironment)) {
    throw new Error(
      "APP_ENV must identify a supported application environment.",
    );
  }

  const resourceEnvironment =
    process.env.DATABASE_RESOURCE_ENV ?? appEnvironment;
  if (!deploymentEnvironments.has(resourceEnvironment)) {
    throw new Error(
      "DATABASE_RESOURCE_ENV must identify a supported database environment.",
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for super-admin provisioning.");
  }
  const protocol = new URL(databaseUrl).protocol;
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }

  return {
    APP_ENV: appEnvironment,
    DATABASE_RESOURCE_ENV: resourceEnvironment,
    DATABASE_URL: databaseUrl,
  };
}

function argument(name: string): string | undefined {
  return process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

async function hiddenPassword(): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
    throw new Error("Provisioning requires an interactive terminal.");
  }
  stdout.write("Existing account password: ");
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", read);
    };
    const read = (chunk: string) => {
      if (chunk === "\u0003") {
        cleanup();
        stdout.write("\n");
        reject(new Error("Provisioning was canceled."));
      } else if (chunk === "\r" || chunk === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
      } else if (chunk === "\u007f" || chunk === "\b") {
        value = value.slice(0, -1);
      } else if (/^[\u0020-\u007e]+$/.test(chunk) && value.length < 128) {
        value += chunk;
      }
    };
    stdin.on("data", read);
  });
}

const userId = argument("user");
const suppliedEmail = argument("email");
const suppliedEnvironment = argument("environment");
const suppliedResource = argument("resource");
if (!userId || !suppliedEmail || !suppliedEnvironment || !suppliedResource) {
  throw new Error(
    "Usage: pnpm admin:provision --user=<uuid> --email=<email> --environment=<environment> --resource=<database-resource-environment>",
  );
}

const environment = provisioningEnvironment();
const expectedResource = environment.DATABASE_RESOURCE_ENV;
if (
  suppliedEnvironment !== environment.APP_ENV ||
  suppliedResource !== expectedResource
) {
  throw new Error(
    "The environment and database resource confirmations must exactly match the configured target.",
  );
}

const normalizedEmail = normalizeEmail(suppliedEmail);
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: environment.DATABASE_URL }),
});
const account = await prisma.user.findFirst({
  where: { id: userId, normalizedEmail },
});
if (!account || account.status !== "ACTIVE" || !account.emailVerifiedAt) {
  throw new Error("The target must be an existing active, verified account.");
}
const password = await hiddenPassword();
if (
  !(await new Argon2PasswordHasher().verify(account.passwordHash, password))
) {
  throw new Error("The existing account password was not accepted.");
}

const result = await prisma.$transaction(
  async (transaction) => {
    await transaction.$executeRaw(
      Prisma.sql`DO $$ BEGIN PERFORM pg_advisory_xact_lock(726381052); END $$`,
    );
    const target = await transaction.user.findFirst({
      where: { id: userId, normalizedEmail },
    });
    if (!target || target.status !== "ACTIVE" || !target.emailVerifiedAt) {
      throw new Error("The target account is no longer eligible.");
    }
    const existing = await transaction.user.findFirst({
      where: { role: "SUPER_ADMIN" },
    });
    if (existing && existing.id !== target.id) {
      throw new Error("A different super-admin already exists.");
    }
    if (target.role === "SUPER_ADMIN") {
      return { id: target.id, idempotent: true };
    }
    await transaction.user.update({
      where: { id: target.id },
      data: { role: "SUPER_ADMIN" },
    });
    await transaction.session.deleteMany({ where: { userId: target.id } });
    await transaction.auditEntry.create({
      data: {
        actorUserId: target.id,
        action: "SUPER_ADMIN_PROVISIONED",
        targetType: "USER",
        targetId: target.id,
        metadata: {
          environment: environment.APP_ENV,
          resourceEnvironment: expectedResource,
        },
      },
    });
    return { id: target.id, idempotent: false };
  },
  { isolationLevel: "Serializable" },
);

stdout.write(
  `${result.idempotent ? "Super-admin already provisioned" : "Super-admin provisioned and sessions revoked"}: ${result.id}\n`,
);
await prisma.$disconnect();
