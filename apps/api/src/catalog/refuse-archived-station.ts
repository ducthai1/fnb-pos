import type pg from "pg";
import { CATALOG_API_ERROR_CODES } from "./catalog-api-error-codes";
import { CatalogRequestError } from "./catalog-request-error";

/**
 * A product on the menu must name a station that is in use: one that is out of use is sent
 * to no till, so the product would be rung up and printed nowhere. A product already off
 * the menu may keep the station it had (editing a retired product), it just cannot be put
 * back on the menu with it (see refuseResumingWithArchivedStation).
 */
export async function refuseArchivedStation(
  client: pg.PoolClient,
  productId: string,
  stationId: string | null,
): Promise<void> {
  if (stationId === null) return;
  const station = await client.query<{ archived: boolean }>(
    "SELECT archived_at IS NOT NULL AS archived FROM station WHERE id = $1",
    [stationId],
  );
  if (station.rows[0]?.archived !== true) return;
  const stored = await client.query<{ station_id: string | null; archived_at: Date | null }>(
    "SELECT station_id, archived_at FROM product WHERE id = $1",
    [productId],
  );
  const kept = stored.rows[0];
  if (kept !== undefined && kept.archived_at !== null && kept.station_id === stationId) return;
  throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.stationArchived);
}

/** Putting a retired product back on the menu while its station is out of use. */
export async function refuseResumingWithArchivedStation(
  client: pg.PoolClient,
  productId: string,
): Promise<void> {
  const found = await client.query(
    "SELECT 1 FROM product p JOIN station s ON s.id = p.station_id " +
      "WHERE p.id = $1 AND s.archived_at IS NOT NULL",
    [productId],
  );
  if (found.rowCount === 1) {
    throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.stationArchived);
  }
}
