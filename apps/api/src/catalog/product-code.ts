import type pg from "pg";
import { CATALOG_API_ERROR_CODES } from "./catalog-api-error-codes";
import { CatalogRequestError } from "./catalog-request-error";

/** The unique index that keeps a code to one product of the brand on the menu. */
const CODE_INDEX = "product_brand_code_key";

/** Whether `error` is the database refusing a second product with the same code. */
export const isProductCodeClash = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === "23505" &&
  (error as { constraint?: unknown }).constraint === CODE_INDEX;

/** Runs a write that sets or frees a product code; a clash becomes the catalog's own refusal. */
export async function refusingTakenCode<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isProductCodeClash(error)) {
      throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.productCodeTaken);
    }
    throw error;
  }
}

/**
 * The next SP00001, SP00002... of the brand: one past the highest SP number any of its
 * products ever had (an archived product's included, so a number is never handed out twice).
 * The caller holds the tenant's feed lock, so two saves never pick the same one.
 */
export async function nextProductCode(client: pg.PoolClient, brandId: string): Promise<string> {
  const found = await client.query<{ highest: string | null }>(
    "SELECT max(substring(code from 3)::bigint) AS highest FROM product " +
      "WHERE brand_id = $1 AND code ~ '^SP[0-9]{1,15}$'",
    [brandId],
  );
  const next = BigInt(found.rows[0]?.highest ?? 0) + 1n;
  return `SP${next.toString().padStart(5, "0")}`;
}

/**
 * The code to store for a saved product: the one the body gives; else the one the product
 * already has; else, for a new product, the next free one.
 */
export async function codeToStore(
  client: pg.PoolClient,
  brandId: string,
  productId: string,
  given: string | undefined,
): Promise<string> {
  if (given !== undefined) return given;
  const stored = await client.query<{ code: string }>("SELECT code FROM product WHERE id = $1", [
    productId,
  ]);
  return stored.rows[0]?.code ?? (await nextProductCode(client, brandId));
}
