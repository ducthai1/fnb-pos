// A table's order is read like any order the till holds.
export {
  type StoredOrder as StoredTableOrder,
  readStoredOrder as readStoredTableOrder,
} from "../order/stored-order";
