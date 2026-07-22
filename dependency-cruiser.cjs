/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-has-no-infrastructure",
      severity: "error",
      from: { path: "^src/modules/[^/]+/domain" },
      to: {
        path: "(^src/modules/[^/]+/infrastructure)|(^src/platform)|(^src/app)",
      },
    },
    {
      name: "application-has-no-infrastructure",
      severity: "error",
      from: { path: "^src/modules/[^/]+/application" },
      to: { path: "(^src/modules/[^/]+/infrastructure)|(^src/app)" },
    },
    {
      name: "features-do-not-import-app",
      severity: "error",
      from: { path: "^src/modules" },
      to: { path: "^src/app" },
    },
    {
      name: "core-layers-have-no-framework-or-provider-sdks",
      severity: "error",
      from: { path: "^src/modules/[^/]+/(domain|application)" },
      to: {
        dependencyTypes: ["npm"],
        path: "^(next($|/)|@prisma($|/)|resend$|stripe$|@vercel/blob$|sharp$)",
      },
    },
    {
      name: "prisma-generated-is-infrastructure-only",
      severity: "error",
      from: { path: "^src/(app|modules/[^/]+/(domain|application))" },
      to: { path: "^src/generated/prisma" },
    },
    {
      name: "vercel-blob-is-media-infrastructure-only",
      severity: "error",
      from: { pathNot: "^(src/modules/media/infrastructure|tests|scripts)" },
      to: { dependencyTypes: ["npm"], path: "^@vercel/blob$" },
    },
    {
      name: "resend-is-auth-infrastructure-only",
      severity: "error",
      from: { pathNot: "^src/modules/auth/infrastructure" },
      to: { dependencyTypes: ["npm"], path: "^resend$" },
    },
    {
      name: "sharp-is-media-infrastructure-only",
      severity: "error",
      from: { pathNot: "^src/modules/media/infrastructure" },
      to: { dependencyTypes: ["npm"], path: "^sharp$" },
    },
    {
      name: "stripe-is-payment-infrastructure-only",
      severity: "error",
      from: { pathNot: "^src/modules/payments/infrastructure" },
      to: { dependencyTypes: ["npm"], path: "^stripe$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)(node_modules|src/generated/prisma|\\.next)(/|$)",
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "default"],
    },
  },
};
