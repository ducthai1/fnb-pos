import { type TestPostgresInfo, startTestPostgres } from "@fnb/db/test-support";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    testPostgres: TestPostgresInfo;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const postgres = await startTestPostgres();
  project.provide("testPostgres", postgres.info);
  return () => postgres.stop();
}
