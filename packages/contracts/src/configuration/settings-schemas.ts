import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";

/** A layer settings can be set at: a brand, a branch, or one till (device). */
export const configScopeKindSchema = z.enum(["brand", "branch", "device"]);

/** GET /settings?scope=&scopeId=: the brand, branch or till whose settings to show. */
export const settingsQuerySchema = z
  .object({ scope: configScopeKindSchema, scopeId: uuidSchema })
  .strict();

/** PUT and DELETE /settings/:scope/:scopeId/:key. */
export const settingParamsSchema = z
  .object({
    scope: configScopeKindSchema,
    scopeId: uuidSchema,
    key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  })
  .strict();

/**
 * PUT /settings/:scope/:scopeId/:key: the value to set at that layer, checked against the
 * key's own schema by the server. JSON null is a value (a deliberate "none"); removing the
 * layer's value, so it inherits again, is DELETE.
 */
export const settingBodySchema = z
  .object({ value: z.unknown() })
  .strict()
  .refine((body) => body.value !== undefined, { message: "value is missing" });

const sourceSchema = z.enum(["system", "brand", "branch", "device"]);
const layerSchema = z.record(z.string(), z.unknown());

/** One switch or setting as it applies at the scope asked about, and where it comes from. */
export const settingEntrySchema = z
  .object({
    key: z.string(),
    kind: z.enum(["flag", "setting"]),
    value: z.unknown(),
    source: sourceSchema,
    /** Whether this layer may set the key: a branch-wide switch cannot differ per till. */
    editableHere: z.boolean(),
    /** Whether this very layer sets it (else it is inherited, and DELETE does nothing). */
    setHere: z.boolean(),
    /**
     * For a switch: how far the till follows it (a switch the till ignores is shown locked,
     * "coming soon"); absent means it works, as it does for every setting that is no switch.
     */
    support: z.enum(["works", "locked_on", "coming_soon", "see_profile"]).optional(),
  })
  .strict();

/**
 * The answer of GET /settings (and of a PUT or DELETE): what each layer from the built-in
 * defaults down to the scope stores, and every known key resolved through them.
 */
export const settingsViewSchema = z
  .object({
    scope: z.object({ kind: configScopeKindSchema, id: uuidSchema }).strict(),
    layers: z
      .object({
        system: layerSchema,
        brand: layerSchema,
        branch: layerSchema.optional(),
        device: layerSchema.optional(),
      })
      .strict(),
    entries: z.array(settingEntrySchema),
  })
  .strict();

export type ConfigScopeKind = z.infer<typeof configScopeKindSchema>;
export type SettingEntry = z.infer<typeof settingEntrySchema>;
export type SettingsView = z.infer<typeof settingsViewSchema>;
