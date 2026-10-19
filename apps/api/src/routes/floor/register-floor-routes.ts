import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { registerAreaRoutes } from "./area-routes";
import { registerDiningTableRoutes } from "./dining-table-routes";

/** The branch floor plan: areas and the tables standing in them. */
export function registerFloorRoutes(app: FastifyInstance, context: ApiContext): void {
  registerAreaRoutes(app, context);
  registerDiningTableRoutes(app, context);
}
