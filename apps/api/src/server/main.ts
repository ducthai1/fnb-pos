import { readServerConfig } from "./server-config";
import { type RunningServer, startServer } from "./start-server";

/**
 * The API process: configuration from the environment, then the server, stopped cleanly on
 * SIGINT or SIGTERM (requests in flight finish, the invoice worker ends its round, the pool
 * closes). A second signal, or a stop that hangs, ends the process anyway. Nothing printed
 * here carries a configuration value beyond the address, environment and provider.
 */
const STOP_TIMEOUT_MS = 10_000;
const log = (line: string) => console.log(`fnb-api: ${line}`);

const configured = readServerConfig(process.env);
if (!configured.ok) {
  console.error("fnb-api: the configuration is not valid:");
  for (const problem of configured.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
const { config } = configured;

let server: RunningServer;
try {
  server = await startServer(config, log);
} catch (error) {
  console.error(`fnb-api: could not start: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
log(`listening on ${server.url} (${config.environment}, invoices: ${config.einvoiceProvider})`);

const stop = async (signal: NodeJS.Signals) => {
  log(`${signal} received, stopping`);
  setTimeout(() => {
    console.error("fnb-api: did not stop in time, exiting");
    process.exit(1);
  }, STOP_TIMEOUT_MS).unref();
  try {
    await server.stop();
    log("stopped");
    process.exit(0);
  } catch (error) {
    console.error(`fnb-api: stopping failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
