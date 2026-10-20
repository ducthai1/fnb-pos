import type { SettingsView } from "@fnb/contracts";
import { resolveConfig } from "@fnb/feature-flags";
import { CONFIG_KEY_DEFINITIONS, layerMaySet, systemLayer } from "./config-key-definitions";
import type { ScopeConfig } from "./read-scope-config";

/**
 * Every known key as it applies at the scope: its value through the layers down to the
 * scope, which layer that value came from, and whether the scope may set or sets it.
 * The layers go out as stored; they hold settings, never secrets (gateway secrets live in
 * their own sealed table and have no route that reads them back).
 */
export function settingsViewOf(scope: ScopeConfig): SettingsView {
  const system = systemLayer();
  const stack = { system, ...scope.layers };
  const own = scope.layers[scope.kind] ?? {};
  const entries = [...CONFIG_KEY_DEFINITIONS.values()].map((definition) => {
    const resolved = resolveConfig(definition.key, stack);
    return {
      key: definition.key,
      kind: definition.kind,
      value: resolved.value,
      source: resolved.source,
      editableHere: layerMaySet(definition, scope.kind),
      setHere: Object.hasOwn(own, definition.key),
    };
  });
  const layers: SettingsView["layers"] = { system, brand: { ...scope.layers.brand } };
  if (scope.layers.branch !== undefined) layers.branch = { ...scope.layers.branch };
  if (scope.layers.device !== undefined) layers.device = { ...scope.layers.device };
  return { scope: { kind: scope.kind, id: scope.id }, layers, entries };
}
