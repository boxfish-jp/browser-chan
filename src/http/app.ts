import { Hono } from "hono";
import type { BrowserSession } from "../browser/session.js";
import { createBrowserMcpHandler } from "../mcp/handler.js";
import { registerLegacyRoutes } from "./legacy.js";

export type BrowserChanAppOptions = {
  session: BrowserSession;
  version: string;
};

export type BrowserChanApp = {
  app: Hono;
  close: () => Promise<void>;
};

export const createBrowserChanApp = (
  options: BrowserChanAppOptions,
): BrowserChanApp => {
  const app = new Hono();

  registerLegacyRoutes(app, { session: options.session });

  app.get("/healthz", (c) =>
    c.json({ status: "ok", browserOpen: options.session.browserOpen }),
  );

  const mcpHandler = createBrowserMcpHandler(options.session, options.version);
  app.all("/mcp", (c) => mcpHandler.fetch(c.req.raw));

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
