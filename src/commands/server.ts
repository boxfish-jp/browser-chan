import { serve } from "@hono/node-server";
import { BrowserSession } from "../browser/session.js";
import { loadServerConfig } from "../config.js";
import { createBrowserChanApp } from "../http/app.js";
import { VERSION } from "../version.js";

export const runServerCommand = async (): Promise<number> => {
  let config: ReturnType<typeof loadServerConfig>;
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
    token: config.token,
    host: config.host,
    allowedMcpHosts: config.allowedMcpHosts,
    version: VERSION,
    maxProfileBytes: config.maxProfileBytes,
    maxExtractedProfileBytes: config.maxExtractedProfileBytes,
  });
  const displayHost = config.host.includes(":")
    ? `[${config.host}]`
    : config.host;
  const server = serve(
    {
      fetch: browserApp.app.fetch,
      port: config.port,
      hostname: config.host,
    },
    (info) => {
      console.log(`browser-chan ${VERSION}`);
      console.log(`Listening on http://${displayHost}:${info.port}`);
      console.log(`MCP endpoint: http://${displayHost}:${info.port}/mcp`);
      console.log(`Profile directory: ${config.profileDir}`);
      console.log(
        config.token
          ? "Authentication: bearer token required for /mcp, /profile/* and /hand"
          : "Authentication: disabled (loopback only)",
      );
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
