import type { DevStackLogins } from "../dev-stack-generated-logins";
import type { BackofficeCall } from "./backoffice-caller";

export interface SeededStaff {
  readonly displayName: string;
  readonly roleName: string;
  readonly pin: string;
}

/** The template roles the organization was provisioned with, one person in each. */
const STAFF = [
  { displayName: "Lan", roleName: "Thu ngân", pin: "cashier" },
  { displayName: "Minh", roleName: "Pha chế", pin: "barista" },
  { displayName: "Hùng", roleName: "Quản lý ca", pin: "manager" },
] as const;

/** Staff created through POST /staff (PIN rules and all) unless someone has the name already. */
export async function seedSampleStaff(
  call: BackofficeCall,
  branchId: string,
  pins: DevStackLogins["staffPins"],
): Promise<SeededStaff[]> {
  const { roles } = await call<{ roles: { id: string; name: string }[] }>("GET", "/roles");
  const { staff } = await call<{ staff: { displayName: string }[] }>("GET", "/staff");
  const hired = new Set(staff.map((member) => member.displayName));
  const seeded: SeededStaff[] = [];
  for (const member of STAFF) {
    const roleId = roles.find((role) => role.name === member.roleName)?.id;
    if (roleId === undefined) throw new Error(`the organization has no role ${member.roleName}`);
    const pin = pins[member.pin];
    if (!hired.has(member.displayName)) {
      await call("POST", "/staff", {
        displayName: member.displayName,
        roleId,
        pin,
        branchIds: [branchId],
      });
    }
    seeded.push({ displayName: member.displayName, roleName: member.roleName, pin });
  }
  return seeded;
}
