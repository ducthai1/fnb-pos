export const ROLE_ERROR_CODES = {
  roleNotFound: "API_ROLE_NOT_FOUND",
  /** Staff or members still hold the role; it is reassigned first, never deleted under them. */
  roleInUse: "API_ROLE_IN_USE",
  /** The change would leave no active member who can manage staff and roles. */
  lastAdministrator: "API_ROLE_LAST_ADMINISTRATOR",
  /** The role was archived: it is given to no one, and kept only for the record. */
  roleArchived: "API_ROLE_ARCHIVED",
  /** The role changed since the caller read it (`?version=`): nothing was written. */
  versionConflict: "API_ROLE_VERSION_CONFLICT",
} as const;
