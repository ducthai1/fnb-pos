/** Stable codes in catalog error bodies; configuration rule codes come from the domain. */
export const CATALOG_API_ERROR_CODES = {
  productNotFound: "API_CATALOG_PRODUCT_NOT_FOUND",
  categoryNotFound: "API_CATALOG_CATEGORY_NOT_FOUND",
  stationNotFound: "API_CATALOG_STATION_NOT_FOUND",
  priceListNotFound: "API_CATALOG_PRICE_LIST_NOT_FOUND",
  brandNotFound: "API_CATALOG_BRAND_NOT_FOUND",
  branchNotFound: "API_CATALOG_BRANCH_NOT_FOUND",
  /** A row the body names (category, station, combo product, scope…) is not in this tenant. */
  referenceNotFound: "API_CATALOG_REFERENCE_NOT_FOUND",
  /** The body was based on another version than the one stored: re-read and retry. */
  versionConflict: "API_CATALOG_VERSION_CONFLICT",
  /** An id in the body already names a row elsewhere (another product, group or tenant). */
  idConflict: "API_CATALOG_ID_CONFLICT",
  parentChangeNotAllowed: "API_CATALOG_PARENT_CHANGE_NOT_ALLOWED",
  inUse: "API_CATALOG_IN_USE",
  /** Another product of the brand on the menu already has this code (ignoring case). */
  productCodeTaken: "API_CATALOG_PRODUCT_CODE_TAKEN",
  unavailableUntilNotInFuture: "API_CATALOG_UNAVAILABLE_UNTIL_NOT_IN_FUTURE",
} as const;
