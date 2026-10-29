import { vi as text } from "@fnb/backoffice/messages/vi";
import { HOSTILE_MENU } from "@fnb/backoffice/test-support/hostile-catalog";
import { newId } from "@fnb/db";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { asOwner, expectNoOverflow, openSection, signedInBackoffice, unexpectedProblems } from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
const T = text.stations;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const tillStations = async (): Promise<string[]> => {
  const response = await fetch(`${stack.apiOrigin}/pos/bootstrap`, { headers: { authorization: `Device ${stack.deviceToken}` } });
  return ((await response.json()) as { menu: { stations: { name: string }[] } }).menu.stations.map((station) => station.name);
};

it("adds, renames and deletes a station, keeps one a product is routed to, and the till follows", async () => {
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.stations);
  await page.getByRole("heading", { name: T.title }).waitFor();

  await page.getByLabel(T.newLabel, { exact: true }).fill("Bar nước");
  await page.getByRole("button", { name: T.add }).click();
  await page.getByText(T.added("Bar nước")).waitFor();
  expect(await tillStations()).toContain("Bar nước");

  await page.getByRole("button", { name: T.renameLabel("Bar nước") }).click();
  await page.getByLabel(T.nameLabel, { exact: true }).fill("Quầy pha chế");
  await page.getByRole("button", { name: text.common.save, exact: true }).click();
  await page.getByText(T.renamed("Quầy pha chế")).waitFor();
  expect(await tillStations()).toContain("Quầy pha chế");

  // A product routed to the station keeps it: deleting would leave the product without a slip.
  const stations = (await asOwner(stack, "GET", `/catalog/stations?branchId=${stack.branchId}`)).body as { id: string; name: string }[];
  const station = stations.find((row) => row.name === "Quầy pha chế")!;
  const brandId = ((await asOwner(stack, "GET", "/branches")).body as { branches: { id: string; brandId: string }[] }).branches.find((b) => b.id === stack.branchId)!.brandId;
  expect((await asOwner(stack, "PUT", `/catalog/products/${newId()}`, { version: null, brandId, kind: "prepared_drink", name: "Món của trạm", basePrice: 20_000, pricingMode: "fixed", stationId: station.id })).status).toBe(201);
  await page.getByRole("button", { name: T.deleteLabel("Quầy pha chế") }).click();
  await page.getByRole("button", { name: text.common.remove, exact: true }).click();
  await page.getByText(T.inUse).waitFor();
  expect(await tillStations()).toContain("Quầy pha chế");

  // An unused one goes, and the till drops it.
  await page.getByLabel(T.newLabel, { exact: true }).fill("Tạm");
  await page.getByRole("button", { name: T.add }).click();
  await page.getByText(T.added("Tạm")).waitFor();
  await page.getByRole("button", { name: T.deleteLabel("Tạm") }).click();
  await page.getByRole("button", { name: text.common.remove, exact: true }).click();
  await page.getByText(T.deleted("Tạm")).waitFor();
  expect(await tillStations()).not.toContain("Tạm");
  // The refused delete is the one answer in this flow that is not a problem.
  expect(unexpectedProblems(problems).filter((problem) => !(problem.url.includes("/catalog/stations/") && (problem.text === "409" || problem.text.includes("status of 409"))))).toEqual([]);
  await close();
});

it("keeps the stations page inside a phone and a computer screen with 60 hostile names", async () => {
  for (let at = 0; at < 60; at++) {
    const name = `${HOSTILE_MENU.productName}${at}`.slice(0, 120);
    expect((await asOwner(stack, "PUT", `/catalog/stations/${newId()}`, { version: null, branchId: stack.branchId, name })).status).toBe(201);
  }
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await page.goto(`${stack.backofficeOrigin}/menu/stations`);
  await page.getByText(HOSTILE_MENU.productName.slice(0, 60), { exact: false }).first().waitFor();
  await expectNoOverflow(page, "the stations page");
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
