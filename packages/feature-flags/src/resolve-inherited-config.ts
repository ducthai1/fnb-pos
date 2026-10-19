import { FeatureFlagError } from "./feature-flag-error";
import { FEATURE_FLAGS_ERROR_CODES } from "./feature-flags-error-codes";

export type ConfigSource = "system" | "brand" | "branch" | "device";

type ConfigLayer = Readonly<Record<string, unknown>>;

/**
 * Settings from the broadest layer to the most specific: built-in defaults in code, then
 * what the brand, the branch and the device changed. Layers a caller has not loaded may be
 * left out.
 */
export interface ConfigLayers {
  readonly system: ConfigLayer;
  readonly brand?: ConfigLayer | undefined;
  readonly branch?: ConfigLayer | undefined;
  readonly device?: ConfigLayer | undefined;
}

export interface ResolvedConfig {
  readonly value: unknown;
  readonly source: ConfigSource;
}

const MOST_SPECIFIC_FIRST = ["device", "branch", "brand"] as const;

/**
 * The value of `key` from the most specific layer that sets it, and which layer that was,
 * so the backoffice can show "inherited from brand". A stored JSON null counts as set: it
 * is a deliberate value, and removing the row is how a setting goes back to inheriting.
 * Every key must have a system default; one without is a typo in code, and resolving it
 * to nothing would hide that.
 */
export function resolveConfig(key: string, layers: ConfigLayers): ResolvedConfig {
  if (!has(layers.system, key)) {
    throw new FeatureFlagError(
      FEATURE_FLAGS_ERROR_CODES.configKeyWithoutDefault,
      `config key has no system default: ${key}`,
      { key },
    );
  }
  for (const source of MOST_SPECIFIC_FIRST) {
    const layer = layers[source];
    if (layer !== undefined && has(layer, key)) return { value: layer[key], source };
  }
  return { value: layers.system[key], source: "system" };
}

// Own properties only, so a key such as "constructor" never resolves from the prototype;
// an own undefined is treated as unset, since JSON can never produce one.
function has(layer: ConfigLayer, key: string): boolean {
  return Object.hasOwn(layer, key) && layer[key] !== undefined;
}
