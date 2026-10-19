/**
 * The tenant withTenant set for this transaction, as the policies read it. Helpers insert
 * it instead of taking a tenant id argument, so a row can never be written for a tenant
 * other than the one the transaction is scoped to.
 */
export const CURRENT_TENANT_SQL = "NULLIF(current_setting('app.tenant_id', true), '')::uuid";
