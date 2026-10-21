import { vi as text } from "@fnb/backoffice/messages/vi";
import { ADMIN_SECTIONS } from "@fnb/backoffice/navigation/admin-sections";
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

/** The width from which the backoffice shows its menu as a bar across the top. */
const WIDE_SCREEN_FROM = 1024;

/**
 * Goes to a page by the menu, as a person would: below a computer's width from the drawer
 * behind the menu button, on a computer from the list its group's heading drops.
 */
export async function openSection(page: Page, label: string) {
  const nav = page.getByRole("navigation");
  // By the width, not by what shows: the page swaps the bar for the button only once it
  // hears the screen change, a moment after a resize.
  if ((page.viewportSize()?.width ?? 1280) < WIDE_SCREEN_FROM) {
    await page.getByRole("button", { name: text.shell.openMenu }).click();
  } else {
    const section = ADMIN_SECTIONS.find((entry) => entry.label === label);
    if (section !== undefined) await nav.getByRole("button", { name: text.shell.groups[section.group], exact: true }).click();
  }
  await nav.getByRole("link", { name: label, exact: true }).click();
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
