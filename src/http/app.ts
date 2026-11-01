import { Hono } from "hono";
import type { BrowserSession } from "../browser/session.js";
import { createBrowserMcpHandler } from "../mcp/handler.js";
import { registerAdminRoutes } from "./admin.js";
import { createAuthGate } from "./auth.js";
import { registerLegacyRoutes } from "./legacy.js";
import { createMcpRequestGuard } from "./mcp_guard.js";

export type BrowserChanAppOptions = {
  session: BrowserSession;
  token: string | null;
  host: string;
  allowedMcpHosts: string[];
  version: string;
  maxProfileBytes: number;
  maxExtractedProfileBytes: number;
};

export type BrowserChanApp = {
  app: Hono;
  close: () => Promise<void>;
};

export const createBrowserChanApp = (
  options: BrowserChanAppOptions,
): BrowserChanApp => {
  const app = new Hono();
  const authGate = createAuthGate(options.token);
  const mcpGuard = createMcpRequestGuard(options.host, options.allowedMcpHosts);

  app.use("/mcp", authGate);
  app.use("/profile/*", authGate);
  app.use("/hand", authGate);

  registerLegacyRoutes(app, { session: options.session });
  registerAdminRoutes(app, {
    session: options.session,
    maxProfileBytes: options.maxProfileBytes,
    maxExtractedProfileBytes: options.maxExtractedProfileBytes,
  });

  app.get("/healthz", (c) =>
    c.json({ status: "ok", browserOpen: options.session.browserOpen }),
  );

  const mcpHandler = createBrowserMcpHandler(options.session, options.version);
  app.all("/mcp", (c) => {
    const rejected = mcpGuard(c.req.raw);
    if (rejected) {
      return rejected;
    }
    return mcpHandler.fetch(c.req.raw);
  });

  app.onError((error, c) => {
    console.error(
      "Unhandled server error:",
      error instanceof Error ? error.message : String(error),
    );
    return c.text("Internal Server Error", 500);
  });

  return {
    app,
    close: () => mcpHandler.close(),
  };
};
