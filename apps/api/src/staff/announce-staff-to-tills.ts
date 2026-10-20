import { STAFF_MEMBER_ENTITY } from "@fnb/contracts";
import type pg from "pg";
import { appendChange, lockTenantChangeFeed } from "../sync/change-feed";

/**
 * Sends a staff member's copy to the tills of every branch they work at, as the bootstrap
 * lists them: their name while they may sign in, and null once they are locked, so a till
 * takes them off its PIN screen without starting over. Runs in the caller's transaction,
 * after the change to the staff row.
 */
export async function announceStaffToTills(
  client: pg.ClientBase,
  tenantId: string,
  staffId: string,
): Promise<void> {
  await lockTenantChangeFeed(client, tenantId);
  const { rows } = await client.query<{
    branch_id: string;
    display_name: string;
    active: boolean;
    version: number;
  }>(
    "SELECT sb.branch_id, s.display_name, s.active, s.version FROM staff s JOIN staff_branch sb " +
      "ON sb.tenant_id = s.tenant_id AND sb.staff_id = s.id WHERE s.id = $1 ORDER BY sb.branch_id",
    [staffId],
  );
  for (const row of rows) {
    await appendChange(client, tenantId, {
      branchId: row.branch_id,
      entity: STAFF_MEMBER_ENTITY,
      entityId: staffId,
      snapshot: row.active
        ? { id: staffId, displayName: row.display_name, active: true, version: row.version }
        : null,
      commandId: null,
    });
  }
}
