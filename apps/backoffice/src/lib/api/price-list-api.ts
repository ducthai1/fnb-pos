import { type PriceListDocumentInput, catalogIdSchema, priceListDocumentSchema } from "@fnb/contracts";
import { type ApiResult, type FetchLike, noContent, requestJson, resultOf } from "./api-result";
import { isRecord, listOf, textOf, wholeNumberOf } from "./read-json-fields";

/** A rule of a price list, as the API stores it and the editor sends it. */
export type PriceListRule = PriceListDocumentInput["items"][number];

/** A price list with its rules, as read back (the id and a real version come with it). */
export interface PriceListDocument {
  readonly id: string;
  readonly brandId: string;
  readonly name: string;
  readonly version: number;
  readonly items: readonly PriceListRule[];
}

/** One row of the list screen. */
export interface PriceListSummary {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly itemCount: number;
}

const readSchema = priceListDocumentSchema.extend({ id: catalogIdSchema });

function readDocument(body: unknown): PriceListDocument | null {
  const parsed = readSchema.safeParse(body);
  if (!parsed.success || parsed.data.version === null) return null;
  const { id, brandId, name, version, items } = parsed.data;
  return { id, brandId, name, version, items };
}

const readSummary = (item: Record<string, unknown>): PriceListSummary | null => {
  const [id, name] = [textOf(item, "id"), textOf(item, "name")];
  const [version, itemCount] = [wholeNumberOf(item, "version"), wholeNumberOf(item, "itemCount")];
  return id === null || name === null || version === null || itemCount === null
    ? null
    : { id, name, version, itemCount };
};

export interface PriceListApi {
  listPriceLists(brandId: string): Promise<ApiResult<PriceListSummary[]>>;
  getPriceList(id: string): Promise<ApiResult<PriceListDocument>>;
  putPriceList(id: string, body: PriceListDocumentInput): Promise<ApiResult<PriceListDocument>>;
  deletePriceList(id: string): Promise<ApiResult<true>>;
}

export function httpPriceListApi(base: string, fetchImpl: FetchLike): PriceListApi {
  const url = (path: string) => `${base}/catalog/price-lists${path}`;
  return {
    async listPriceLists(brandId) {
      const answer = await requestJson(fetchImpl, url(`?brandId=${encodeURIComponent(brandId)}`), { method: "GET" });
      return resultOf(answer, (body) => listOf(body, readSummary));
    },
    async getPriceList(id) {
      return resultOf(await requestJson(fetchImpl, url(`/${id}`), { method: "GET" }), readDocument);
    },
    async putPriceList(id, body) {
      const answer = await requestJson(fetchImpl, url(`/${id}`), { method: "PUT", body });
      return resultOf(answer, (reply) => (isRecord(reply) ? readDocument(reply) : null));
    },
    async deletePriceList(id) {
      return resultOf(await requestJson(fetchImpl, url(`/${id}`), { method: "DELETE" }), noContent);
    },
  };
}
