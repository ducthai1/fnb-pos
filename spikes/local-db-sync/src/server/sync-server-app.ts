import Fastify, { type FastifyInstance } from "fastify";
import pg from "pg";
import type { CommandResultWire, PushRequestWire } from "../shared/sync-wire-types";
import { type ApplyOptions, applyCommand } from "./apply-command";
import { readChanges } from "./read-changes";
import { SERVER_SCHEMA_SQL } from "./server-schema-sql";

export interface RunningSyncServer {
  url: string;
  pool: pg.Pool;
  app: FastifyInstance;
  close(): Promise<void>;
}

export interface SyncServerOptions extends Partial<ApplyOptions> {
  connectionString: string;
  /** Lets the browser scenario serve its page from the same origin as the API. */
  register?: (app: FastifyInstance) => void;
}

const MAX_PULL_PAGE = 1_000;

export async function startSyncServer(options: SyncServerOptions): Promise<RunningSyncServer> {
  const pool = new pg.Pool({ connectionString: options.connectionString, max: 10 });
  await pool.query(SERVER_SCHEMA_SQL);
  const applyOptions: ApplyOptions = {
    serializeChanges: options.serializeChanges ?? true,
    now: options.now ?? Date.now,
    ...(options.beforeCommit === undefined ? {} : { beforeCommit: options.beforeCommit }),
  };
  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });

  app.post<{ Body: PushRequestWire }>("/commands", async (request) => {
    const { device_id: deviceId, commands } = request.body;
    const results: CommandResultWire[] = [];
    for (const [index, command] of commands.entries()) {
      const result = await applyCommand(pool, deviceId, command, applyOptions);
      results.push(result);
      if (result.status === "retry") {
        // Everything after a gap is out of order too; say so without touching the database.
        for (const later of commands.slice(index + 1)) {
          results.push({ ...result, command_id: later.command_id });
        }
        break;
      }
    }
    return { results };
  });

  app.get<{ Querystring: { cursor?: string; limit?: string } }>("/changes", async (request) => {
    const cursor = /^\d+$/.test(request.query.cursor ?? "") ? String(request.query.cursor) : "0";
    const limit = Math.min(Number(request.query.limit) || MAX_PULL_PAGE, MAX_PULL_PAGE);
    return readChanges(pool, cursor, limit);
  });

  options.register?.(app);
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  return {
    url,
    pool,
    app,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}
