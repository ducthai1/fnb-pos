import { vi as text } from "@fnb/backoffice/messages/vi";
import { measureScreenOverflow } from "@fnb/pos/test-support/measure-screen-overflow";
import type { Browser, Page } from "playwright-core";
import { expect } from "vitest";
import { type PageProblem, watchPageProblems } from "../../support/page-problems";
import type { BackofficeStack } from "./global-setup-start-backoffice-stack";

export interface BackofficeInBrowser {
  page: Page;
  problems: PageProblem[];
  close(): Promise<void>;
}

/** The HTTP status of the first answer from `/api${path}` after `act`. */
export async function statusAfter(page: Page, path: string, act: () => Promise<void>) {
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname === `/api${path}`);
  await act();
  return (await answered).status();
}

/**
 * Signs in through the sign-in page the way an owner does. The account is in two
 * organizations, so the API first answers 409 with the list and the page asks which.
 */
export async function signedInBackoffice(
  browser: Browser,
  stack: BackofficeStack,
  viewport = { width: 1280, height: 900 },
): Promise<BackofficeInBrowser> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const problems = watchPageProblems(page);
  await page.goto(`${stack.backofficeOrigin}/login`);
  // The form is prerendered; typed text is kept only once React has taken it over.
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel(text.login.identifierLabel).fill(stack.email);
  await page.getByLabel(text.login.passwordLabel).fill(stack.password);
  const submit = page.getByRole("button", { name: text.login.submit });
  expect(await statusAfter(page, "/auth/login", () => submit.click())).toBe(409);
  const organization = page.getByRole("button", { name: text.login.enterOrganization(stack.organizationName) });
  expect(await statusAfter(page, "/auth/login", () => organization.click())).toBe(200);
  // Exists only once the shell checked the session and read the branches.
  await page.getByLabel(text.shell.branchLabel).waitFor();
  return { page, problems, close: () => context.close() };
}

/** Goes to a section by the side menu, opening it first where it folds (a phone). */
export async function openSection(page: Page, label: string) {
  const toggle = page.getByRole("button", { name: text.shell.openMenu });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("navigation").getByRole("link", { name: label, exact: true }).click();
}

/**
 * Problems other than the sign-in's expected 409 (the organization question), which the
 * browser reports twice: as the response and as a console line about the resource.
 */
export const unexpectedProblems = (problems: readonly PageProblem[]) =>
  problems.filter((problem) => {
    const signIn = problem.url.endsWith("/api/auth/login");
    if (problem.kind === "http") return !(signIn && problem.text === "409");
    if (problem.kind === "console") return !(signIn && problem.text.includes("status of 409"));
    return true;
  });

/** The page fits at phone and computer width, measured on the element that scrolls. */
export async function expectNoOverflow(page: Page, label: string) {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await measureScreenOverflow(page);
    expect(overflow, `${label} at ${width}px`).toMatchObject({ scrollerExcess: 0, pageExcess: 0, outside: [] });
  }
}

/** A call to the API as the shop's first owner, outside the browser. */
export async function asOwner(stack: BackofficeStack, method: string, path: string, body?: unknown) {
  const response = await fetch(`${stack.apiOrigin}${path}`, {
    method,
    headers: { cookie: stack.managerCookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as unknown };
}
