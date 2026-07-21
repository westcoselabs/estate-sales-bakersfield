declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    testRunId: string;
  }
}

export {};
