import { buildApp } from "./app.js";
import { loadConfig } from "./lib/config.js";

const config = loadConfig();
const { app } = await buildApp({ config });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.port, host: config.host });
app.log.info(`Chores läuft auf Port ${config.port} (Zeitzone ${config.tz})`);
