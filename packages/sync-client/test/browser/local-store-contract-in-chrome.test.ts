import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  LOCAL_STORE_CONTRACT,
  contractCaseId,
} from "../../src/local-store/contract/local-store-contract";
import {
  type BrowserCaseResult,
  type ContractPageRun,
  OPFS_PRAGMAS_CASE,
} from "./browser-page-results";
import { launchSystemChrome, watchPage } from "./support/system-chrome";

let browser: Browser | undefined;
let status: number | undefined;
let problems: string[] = [];
const results = new Map<string, BrowserCaseResult>();

beforeAll(async () => {
  browser = await launchSystemChrome();
  const page = await (await browser.newContext()).newPage();
  problems = watchPage(page).problems;
  status = (await page.goto(`${inject("browserPagesOrigin")}/contract.html`))?.status();
  // Set only by the page's own script once every case ran: the page cannot be read early.
  await page.waitForFunction("window.__contractRun !== undefined", undefined, {
    timeout: 150_000,
  });
  const run = (await page.evaluate("window.__contractRun")) as ContractPageRun;
  for (const result of run.results) results.set(result.id, result);
}, 180_000);

afterAll(async () => {
  await browser?.close();
});

it("serves the contract page and runs it with no console error and no failed request", () => {
  expect(status).toBe(200);
  expect(problems).toEqual([]);
});

const outcomeOf = (id: string) => {
  const result = results.get(id);
  // A case the page never ran must not pass as one that ran clean.
  expect(result, `the page did not run "${id}"`).toBeDefined();
  return result?.error ?? "passed";
};

for (const group of LOCAL_STORE_CONTRACT) {
  describe(`LocalStore on SQLite WASM in a browser Worker: ${group.name}`, () => {
    for (const contractCase of group.cases) {
      it(contractCase.name, () => {
        expect(outcomeOf(contractCaseId(group, contractCase.name))).toBe("passed");
      });
    }
  });
}

it(OPFS_PRAGMAS_CASE, () => {
  expect(outcomeOf(OPFS_PRAGMAS_CASE)).toBe("passed");
});
