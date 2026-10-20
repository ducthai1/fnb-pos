import { withTenant } from "@fnb/db";
import { ROLE_TEMPLATES } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import type pg from "pg";
import type { Page } from "playwright-core";
import type { PosStack } from "../../support/global-setup-start-pos-stack";
import { backoffice } from "./backoffice-calls";

/** The shop's second branch: a spec that switches a branch setting does it there, alone. */
export async function otherBranchOf(pool: pg.Pool, stack: PosStack): Promise<string> {
  return withTenant(pool, stack.tenantId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM branch WHERE id <> $1 ORDER BY id LIMIT 1",
      [stack.branchId],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("the stack's shop has no second branch");
    return id;
  });
}

/** A manager of `branchId`, with the manager template's keys, who approves with `pin`. */
export async function managerAt(
  stack: PosStack,
  branchId: string,
  displayName: string,
  pin: string,
) {
  const permissionKeys = ROLE_TEMPLATES.manager.grants.map((grant) => grant.key);
  const { roleId } = await backoffice(
    stack,
    "POST",
    "/roles",
    { name: `${displayName} (vai trò)`, permissionKeys, thresholds: {} },
    201,
  );
  await backoffice(
    stack,
    "POST",
    "/staff",
    { displayName, pin, roleId, branchIds: [branchId] },
    201,
  );
}

/**
 * The manager approves on the till's sheet, picking their name and typing their PIN; answers
 * the HTTP status POST /pos/approvals came back with.
 */
export async function managerApproves(page: Page, manager: string, pin: string) {
  await page.getByRole("heading", { name: text.approval.title }).waitFor();
  await page.getByRole("button", { name: manager, exact: true }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
  const asked = page.waitForResponse((response) => response.url().endsWith("/api/pos/approvals"));
  await page.getByRole("button", { name: text.approval.approve, exact: true }).click();
  return (await asked).status();
}

/** What the sheet says it asks a manager for. */
export const approvalAskedFor = (page: Page) =>
  page.locator("[data-approval-for]").getAttribute("data-approval-for");
