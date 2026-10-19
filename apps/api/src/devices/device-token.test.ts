import { describe, expect, it } from "vitest";
import { newDeviceToken, readDeviceToken } from "./device-token";

const TENANT = "0192f5a4-3b7c-7d2e-8f10-1a2b3c4d5e6f";

describe("device tokens", () => {
  it("are read back from the Authorization header they are sent in", () => {
    const token = newDeviceToken(TENANT);
    expect(readDeviceToken(`Device ${token}`)).toEqual({ token, tenantId: TENANT });
  });

  it("are different every time", () => {
    expect(newDeviceToken(TENANT)).not.toBe(newDeviceToken(TENANT));
  });

  it.each([
    ["no header", undefined],
    ["another scheme", `Bearer ${TENANT}.${"a".repeat(43)}`],
    ["no secret", `Device ${TENANT}`],
    ["a short secret", `Device ${TENANT}.${"a".repeat(42)}`],
    ["a secret with a dot", `Device ${TENANT}.${"a".repeat(21)}.${"a".repeat(21)}`],
    ["an uppercase tenant", `Device ${TENANT.toUpperCase()}.${"a".repeat(43)}`],
    ["a tenant that is not a uuid", `Device acme.${"a".repeat(43)}`],
    ["trailing text", `Device ${TENANT}.${"a".repeat(43)} extra`],
  ])("are refused with %s", (_case, header) => {
    expect(readDeviceToken(header)).toBeNull();
  });
});
