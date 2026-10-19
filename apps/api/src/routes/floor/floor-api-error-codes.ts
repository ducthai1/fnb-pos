/** Stable codes in floor plan error bodies; the backoffice maps them to Vietnamese messages. */
export const FLOOR_API_ERROR_CODES = {
  branchNotFound: "API_FLOOR_BRANCH_NOT_FOUND",
  areaNotFound: "API_FLOOR_AREA_NOT_FOUND",
  tableNotFound: "API_FLOOR_TABLE_NOT_FOUND",
  /** The body was based on another version than the one stored: re-read and retry. */
  versionConflict: "API_FLOOR_VERSION_CONFLICT",
  /** The id is already taken by another row (another kind of row, or another tenant's). */
  idConflict: "API_FLOOR_ID_CONFLICT",
  /** An area stays in its branch, and a table moves only between areas of its branch. */
  branchChangeNotAllowed: "API_FLOOR_BRANCH_CHANGE_NOT_ALLOWED",
  /** Archived rows are history of where orders sat; they are not edited any more. */
  archived: "API_FLOOR_ARCHIVED",
  /** A table cannot be put in, or left active in, an archived area. */
  areaArchived: "API_FLOOR_AREA_ARCHIVED",
  /** The area still has tables in use on the floor; archive or move them first. */
  areaHasTables: "API_FLOOR_AREA_HAS_TABLES",
  /** Guests are seated at the table: pay, cancel or move their order first. */
  tableHasOpenOrder: "API_FLOOR_TABLE_HAS_OPEN_ORDER",
} as const;
