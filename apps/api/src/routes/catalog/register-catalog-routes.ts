import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { registerAvailabilityRoutes } from "./availability-routes";
import { registerCategoryAndStationRoutes } from "./category-and-station-routes";
import { registerPriceListRoutes } from "./price-list-routes";
import { registerProductRoutes } from "./product-routes";

/** The backoffice menu: reading needs a signed-in member, writing also edit_menu. */
export function registerCatalogRoutes(app: FastifyInstance, context: ApiContext): void {
  registerProductRoutes(app, context);
  registerCategoryAndStationRoutes(app, context);
  registerAvailabilityRoutes(app, context);
  registerPriceListRoutes(app, context);
}
