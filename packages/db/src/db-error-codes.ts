export const DB_ERROR_CODES = {
  migrationInvalidFileName: "DB_MIGRATION_INVALID_FILE_NAME",
  migrationDuplicateNumber: "DB_MIGRATION_DUPLICATE_NUMBER",
  migrationChecksumMismatch: "DB_MIGRATION_CHECKSUM_MISMATCH",
  migrationFailed: "DB_MIGRATION_FAILED",
  invalidTenantId: "DB_TENANT_INVALID_ID",
} as const;
