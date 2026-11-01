import { createMcpHandler } from "@modelcontextprotocol/server";
import type { BrowserSession } from "../browser/session.js";
import { createBrowserMcpServer } from "./tools.js";

export const createBrowserMcpHandler = (
  session: BrowserSession,
  version: string,
  onerror: (error: Error) => void = (error) => {
    console.error("MCP request failed:", error.message);
  },
) =>
  createMcpHandler(() => createBrowserMcpServer(session, version), {
    legacy: "stateless",
    onerror,
  });
