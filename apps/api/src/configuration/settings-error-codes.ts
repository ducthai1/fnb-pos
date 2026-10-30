/** Codes of the settings routes; the backoffice maps them to Vietnamese. */
export const SETTINGS_ERROR_CODES = {
  /** No switch or setting has this key. */
  unknownKey: "API_SETTINGS_UNKNOWN_KEY",
  /** The brand, branch or till named is not in this organization. */
  scopeNotFound: "API_SETTINGS_SCOPE_NOT_FOUND",
  /** The key cannot be set this specifically (a branch-wide switch for one till). */
  layerNotAllowed: "API_SETTINGS_LAYER_NOT_ALLOWED",
  /** The till always behaves as "on" for this switch, so it cannot be turned off. */
  flagLockedOn: "API_SETTINGS_FLAG_LOCKED_ON",
} as const;
