import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { signedInMemberSchema } from "./signed-in-member-schema";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;
const member = {
  accountId: id(1),
  organizationId: id(2),
  organizationName: "Công ty Phở Sáng",
  appUserId: id(3),
  displayName: null,
  permissionKeys: ["manage_devices", "edit_menu"],
};

describe("signedInMemberSchema", () => {
  it("takes the member with the keys their role holds, none included", () => {
    expect(outcomeOf(signedInMemberSchema, member).ok).toBe(true);
    expect(outcomeOf(signedInMemberSchema, { ...member, permissionKeys: [] }).ok).toBe(true);
  });

  it("refuses a key the permission catalog does not have, and a missing list", () => {
    const invented = { ...member, permissionKeys: ["manage_everything"] };
    expect(outcomeOf(signedInMemberSchema, invented).ok).toBe(false);
    expect(outcomeOf(signedInMemberSchema, { ...member, permissionKeys: undefined }).ok).toBe(false);
  });
});
