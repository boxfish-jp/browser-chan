import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowserSession } from "../browser/session.js";
import { createBrowserChanApp } from "./app.js";

const initializeRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "app-test", version: "1.0.0" },
  },
};

const liveDataProps = JSON.stringify({
  site: { relive: { webSocketUrl: "wss://example.test/relive" } },
  program: { vposBaseTime: 1700000000, nicoliveProgramId: "lv12345" },
});

type ScratchPage = {
  goto: () => Promise<void>;
  evaluate: () => Promise<string>;
};

const createSession = () => {
  const scratchPageCalls: ScratchPage[] = [];
  const scratchPage: ScratchPage = {
    goto: async () => undefined,
    evaluate: async () => liveDataProps,
  };
  const session = {
    browserOpen: false,
    closeBrowser: async () => undefined,
    closeContextNow: async () => undefined,
    withScratchPage: async (
      action: (page: ScratchPage) => Promise<unknown>,
    ) => {
      scratchPageCalls.push(scratchPage);
      return action(scratchPage);
    },
  };
  return { session: session as unknown as BrowserSession, scratchPageCalls };
};

const createTestApp = (session: BrowserSession = createSession().session) =>
  createBrowserChanApp({
    session,
    version: "2.0.0",
  });

describe("createBrowserChanApp", () => {
  it("mcpにinitializeをPOSTすると200を返す", async () => {
    const response = await createTestApp().app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(initializeRequest),
    });
    assert.equal(response.status, 200);
  });

  it("handは404を返す", async () => {
    const response = await createTestApp().app.request("/hand");
    assert.equal(response.status, 404);
  });

  it("healthzは200を返す", async () => {
    const response = await createTestApp().app.request("/healthz");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      browserOpen: false,
    });
  });

  it("GET /はpropsをJSONで返す", async () => {
    const { session, scratchPageCalls } = createSession();
    const response = await createTestApp(session).app.request("/");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      nicoWsurl: "wss://example.test/relive",
      vposBaseTime: 1700000000,
      liveId: "lv12345",
    });
    assert.equal(scratchPageCalls.length, 1);
  });

  it("closeは例外を投げない", async () => {
    const app = createTestApp();
    await app.close();
  });
});
