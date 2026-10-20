import { join } from "node:path";
import { afterAll, describe, it } from "vitest";
import {
  type ContractStore,
  LOCAL_STORE_CONTRACT,
  type LocalStoreHarness,
  type SqlFault,
  matchesFault,
} from "./contract/local-store-contract";
import { faultyDriver } from "./local-store-fixtures";
import { scratchDirectory } from "./local-store-test-support";
import { openNodeSqliteDriver } from "./node-sqlite-driver";
import { createSqliteLocalStore } from "./sqlite-local-store";

const dir = scratchDirectory("local-store-contract");
afterAll(() => dir.remove());

const opened = (path: string, fault?: SqlFault): ContractStore => {
  const { driver, control } = faultyDriver(openNodeSqliteDriver(path), (sql) =>
    matchesFault(fault, sql),
  );
  return {
    store: createSqliteLocalStore(driver),
    setFaultArmed: async (armed) => {
      control.armed = armed;
    },
    querySql: async (sql) => driver.all(sql),
  };
};

const nodeSqliteHarness: LocalStoreHarness = {
  open: async (options = {}) => opened(":memory:", options.fault),
  openFile: async (name) => opened(join(dir.path, `${name}.db`)),
};

for (const group of LOCAL_STORE_CONTRACT) {
  describe(`LocalStore on node:sqlite: ${group.name}`, () => {
    for (const contractCase of group.cases) {
      it(contractCase.name, () => contractCase.run(nodeSqliteHarness));
    }
  });
}
