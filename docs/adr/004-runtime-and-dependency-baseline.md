# ADR 004: Runtime and Dependency Baseline

Status: accepted for Phase 1; exact versions live in repository configuration and lockfile.

## Decision

Pin the validated Node/pnpm runtime and every direct dependency in `package.json`; commit `pnpm-lock.yaml`; keep TypeScript library checking enabled; and use automated dependency update pull requests gated by full credential-free CI and applicable provider contracts.

During bootstrap, TypeScript 7.0.2 was rejected because the selected Next.js 16.2.10 declarations did not type-check with `skipLibCheck: false`. TypeScript 5.9.3 was selected. ESLint 10.7 was rejected because the selected Next.js ESLint configuration's peer tree targets ESLint 9; ESLint 9.39.5 was selected. Webpack was pinned to satisfy the Sentry/Next integration peer contract. These are compatibility findings, not permanent architecture constraints; future upgrades require CI and provider-contract evidence.

Bootstrap audit findings for transitive PostCSS and `@hono/node-server` releases were resolved with narrow pnpm overrides to their advisory-patched versions. Production dependency audit at moderate severity is part of credential-free verification.
