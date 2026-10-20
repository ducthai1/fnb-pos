import type pg from "pg";
import { newId } from "../ids/new-id";

/**
 * The generation of the database the API serves: drawn when it was first migrated and
 * again after every restore. Tills compare it with the one they last saw to learn that
 * the server lost what it took after the backup. Callable by the app role.
 */
export async function readServerGeneration(client: pg.ClientBase): Promise<string> {
  const { rows } = await client.query<{ generation: string | null }>(
    "SELECT fnb_server.current_generation()::text AS generation",
  );
  const generation = rows[0]?.generation;
  if (generation === null || generation === undefined) {
    throw new Error("fnb_server.generation holds no row");
  }
  return generation;
}

/**
 * Draws a new generation; run by an admin or the owner on the database just restored (or
 * by hand), never by the API. A database restored from a backup older than the generation
 * table has none yet: the migration that creates it draws one, so that is no error.
 */
export async function renewServerGeneration(
  client: pg.ClientBase,
): Promise<{ readonly previous: string | null; readonly current: string | null }> {
  const { rows: found } = await client.query<{ present: boolean }>(
    "SELECT to_regclass('fnb_server.generation') IS NOT NULL AS present",
  );
  if (found[0]?.present !== true) return { previous: null, current: null };
  const current = newId();
  const { rows } = await client.query<{ previous: string | null }>(
    "WITH before AS (SELECT generation::text AS previous FROM fnb_server.generation) " +
      "UPDATE fnb_server.generation SET generation = $1, drawn_at = now() " +
      "RETURNING (SELECT previous FROM before)",
    [current],
  );
  if (rows.length === 0) throw new Error("fnb_server.generation holds no row");
  return { previous: rows[0]?.previous ?? null, current };
}
