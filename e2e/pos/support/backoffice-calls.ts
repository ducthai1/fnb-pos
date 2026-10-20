import type { PosStack } from "../../support/global-setup-start-pos-stack";

/** A backoffice call as the shop's owner; fails the spec unless it answers `status`. */
export async function backoffice(
  stack: PosStack,
  method: "POST" | "PUT",
  path: string,
  body: object,
  status: number,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${stack.apiOrigin}${path}`, {
    method,
    headers: { cookie: stack.managerCookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (response.status !== status)
    throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}

/** A cashier of the stack's branch and a fresh pairing code for a new till there. */
export async function cashierAndPairingCode(stack: PosStack, displayName: string, pin: string) {
  await backoffice(
    stack,
    "POST",
    "/staff",
    { displayName, pin, roleId: stack.roleId, branchIds: [stack.branchId] },
    201,
  );
  const { code } = await backoffice(
    stack,
    "POST",
    "/devices/pairing-codes",
    { branchId: stack.branchId },
    201,
  );
  if (typeof code !== "string") throw new Error("no pairing code in the answer");
  return code;
}

/** Creates or replaces a product document; returns its new version for the next save. */
export async function putProduct(
  stack: PosStack,
  id: string,
  document: object,
  version: number | null,
) {
  const saved = await backoffice(
    stack,
    "PUT",
    `/catalog/products/${id}`,
    { ...document, version, brandId: stack.brandId },
    version === null ? 201 : 200,
  );
  return saved.version as number;
}
