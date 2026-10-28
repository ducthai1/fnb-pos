import type { ProductDocumentInput } from "@fnb/contracts";
import { MEASURE_UNITS, type MeasureUnit } from "@fnb/domain";
import { isRecord, nullableTextOf, textOf, wholeNumberOf } from "../api/read-json-fields";

/** A product as GET/PUT /catalog/products/:id answers it; money in whole đồng. */
export interface ProductDocument {
  readonly id: string;
  readonly version: number;
  readonly archivedAt: string | null;
  readonly brandId: string;
  readonly categoryId: string | null;
  readonly kind: ProductDocumentInput["kind"];
  readonly name: string;
  readonly basePrice: number | null;
  readonly pricingMode: ProductDocumentInput["pricingMode"];
  /** What a weighed product's price is per; null on any other (and from an older API). */
  readonly measureUnit: MeasureUnit | null;
  readonly taxRateBp: number;
  readonly stationId: string | null;
  readonly trackStock: boolean;
  readonly earnsPoints: boolean;
  readonly printCupLabel: boolean;
  /** The stored photo's name, and its address under the API; null without one. */
  readonly imageKey: string | null;
  readonly imageUrl: string | null;
  readonly variants: ProductDocumentInput["variants"];
  readonly modifierGroups: ProductDocumentInput["modifierGroups"];
  readonly combo: ProductDocumentInput["combo"];
}

/** The body PUT /catalog/products/:id takes, as the contract describes it. */
export type ProductBody = ProductDocumentInput;

const KINDS = ["prepared_item", "prepared_drink", "retail_item", "combo", "service"] as const;
const MODES = ["fixed", "open_price", "weighed"] as const;

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | null =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : null;

/**
 * The document of an answer. The top level is checked field by field; variants, groups
 * and the combo are taken as the API wrote them, which is the shape it also accepts back.
 */
export function readProductDocument(body: unknown): ProductDocument | null {
  if (!isRecord(body)) return null;
  const id = textOf(body, "id");
  const version = wholeNumberOf(body, "version");
  const brandId = textOf(body, "brandId");
  const name = textOf(body, "name");
  const taxRateBp = wholeNumberOf(body, "taxRateBp");
  const kind = oneOf(KINDS, body.kind);
  const pricingMode = oneOf(MODES, body.pricingMode);
  const measureUnit = oneOf(MEASURE_UNITS, body.measureUnit);
  const archivedAt = nullableTextOf(body, "archivedAt");
  const categoryId = nullableTextOf(body, "categoryId");
  const stationId = nullableTextOf(body, "stationId");
  const basePrice = body.basePrice === null ? null : wholeNumberOf(body, "basePrice");
  const flags = [body.trackStock, body.earnsPoints, body.printCupLabel];
  if (id === null || version === null || brandId === null || name === null) return null;
  if (taxRateBp === null || kind === null || pricingMode === null) return null;
  if (archivedAt === undefined || categoryId === undefined || stationId === undefined) return null;
  if (basePrice === null && body.basePrice !== null) return null;
  if (measureUnit === null && body.measureUnit !== null && body.measureUnit !== undefined) return null;
  if (!flags.every((flag) => typeof flag === "boolean")) return null;
  if (!Array.isArray(body.variants) || !Array.isArray(body.modifierGroups)) return null;
  return {
    id,
    version,
    archivedAt,
    brandId,
    categoryId,
    kind,
    name,
    basePrice,
    pricingMode,
    measureUnit,
    taxRateBp,
    stationId,
    trackStock: body.trackStock as boolean,
    earnsPoints: body.earnsPoints as boolean,
    printCupLabel: body.printCupLabel as boolean,
    // An API from before photos sends neither: the product has none.
    imageKey: nullableTextOf(body, "imageKey") ?? null,
    imageUrl: nullableTextOf(body, "imageUrl") ?? null,
    variants: body.variants as ProductDocument["variants"],
    modifierGroups: body.modifierGroups as ProductDocument["modifierGroups"],
    combo: (body.combo ?? null) as ProductDocument["combo"],
  };
}

/**
 * The body that saves a document back unchanged; a caller then sets what it changes. It
 * names no photo, so the stored one stays whatever the caller does.
 */
export function bodyOfDocument(document: ProductDocument): ProductBody {
  return {
    version: document.version,
    brandId: document.brandId,
    categoryId: document.categoryId,
    kind: document.kind,
    name: document.name,
    basePrice: document.basePrice,
    pricingMode: document.pricingMode,
    measureUnit: document.measureUnit,
    taxRateBp: document.taxRateBp,
    stationId: document.stationId,
    trackStock: document.trackStock,
    earnsPoints: document.earnsPoints,
    printCupLabel: document.printCupLabel,
    variants: document.variants,
    modifierGroups: document.modifierGroups,
    combo: document.combo,
  };
}
