import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { registerAreaRoutes } from "./area-routes";
import { registerDiningTableRoutes } from "./dining-table-routes";
import { registerTableOccupancyRoute } from "./table-occupancy-route";

/** The branch floor plan (areas, the tables in them) and, for tills, who sits where. */
export function registerFloorRoutes(app: FastifyInstance, context: ApiContext): void {
  registerAreaRoutes(app, context);
  registerDiningTableRoutes(app, context);
  registerTableOccupancyRoute(app, context);
}
