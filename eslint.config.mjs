import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*", "!@/modules/public-search/client"],
              message:
                "Import another feature through its public module entry point.",
            },
            {
              group: ["@/generated/prisma", "@/generated/prisma/*"],
              message: "Generated database types are infrastructure-only.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/modules/*/infrastructure/**/*.{ts,tsx}",
      "src/platform/database/**/*.{ts,tsx}",
      "scripts/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*"],
              message:
                "Import another feature through its public module entry point.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["src/app/_components/event-builder.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*", "!@/modules/media/client"],
              message:
                "Import another feature through its public module entry point.",
            },
            {
              group: ["@/generated/prisma", "@/generated/prisma/*"],
              message: "Generated database types are infrastructure-only.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "coverage/**",
    "node_modules/**",
    "playwright-report/**",
    "src/generated/prisma/**",
    "test-results/**",
  ]),
]);
