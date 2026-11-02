import { serve } from "@hono/node-server";
import { BrowserSession } from "../browser/session.js";
import type { ServerConfig } from "../config.js";
import { loadServerConfig } from "../config.js";
import { createBrowserChanApp } from "../http/app.js";
import { VERSION } from "../version.js";

const hostForDisplay = (host: string): string =>
  host.includes(":") ? `[${host}]` : host;

export const runServerCommand = async (): Promise<number> => {
  let config: ServerConfig;
  try {
    config = loadServerConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const session = new BrowserSession({
    profileDir: config.profileDir,
  });
  const browserApp = createBrowserChanApp({
    session,
    version: VERSION,
  });
  const server = serve(
    {
      fetch: browserApp.app.fetch,
      port: config.port,
      hostname: config.host,
    },
    (info) => {
      console.log(`browser-chan ${VERSION}`);
      if (info.address === "0.0.0.0" || info.address === "::") {
        const anyAddress = hostForDisplay(info.address);
        console.log(`Listening on ${anyAddress}:${info.port} (all interfaces)`);
        console.log(`MCP endpoint: http://<machine address>:${info.port}/mcp`);
      } else {
        const origin = `http://${hostForDisplay(config.host)}:${info.port}`;
        console.log(`Listening on ${origin}`);
        console.log(`MCP endpoint: ${origin}/mcp`);
      }
      console.log(`Profile directory: ${config.profileDir}`);
    },
  );
  server.on("error", (error) => {
    console.error("HTTP server error:", error.message);
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = async (code: number) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log("Shutting down browser-chan...");
    server.close();
    await Promise.race([
      Promise.allSettled([
        browserApp.close(),
        session.closeBrowser(),
        session.closeContextNow(),
      ]),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 5000);
      }),
    ]);
    process.exit(code);
  };
  process.once("SIGINT", () => void shutdown(130));
  process.once("SIGTERM", () => void shutdown(0));

  return new Promise<number>(() => undefined);
};
