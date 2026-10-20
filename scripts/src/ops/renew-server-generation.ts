import { databaseUrlFor, renewServerGeneration } from "@fnb/db";
import pg from "pg";

/**
 * Draws a new server generation in `database` on the server of `adminUrl`. Every till that
 * syncs with that database afterwards sends again what the database does not hold and
 * pulls the feed from the start, so this is what turns a restored backup into one the
 * tills catch up with instead of one they silently disagree with.
 */
export async function renewGenerationOf(
  adminUrl: string,
  database: string,
): Promise<{ readonly previous: string | null; readonly current: string | null }> {
  const client = new pg.Client({ connectionString: databaseUrlFor(adminUrl, { database }) });
  await client.connect();
  try {
    return await renewServerGeneration(client);
  } finally {
    await client.end();
  }
}
