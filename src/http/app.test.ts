import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { BrowserSession } from "../browser/session.js";
import { createBrowserChanApp } from "./app.js";

const token = "app-test-token";

const createTestApp = () => {
  const session = {
    profileDir: join(tmpdir(), "browser-chan-app-test"),
    browserOpen: false,
    withSuspended: async <T>(task: () => Promise<T>) => task(),
    openHeaded: async () => undefined,
    closeBrowser: async () => undefined,
    closeContextNow: async () => undefined,
  } as unknown as BrowserSession;
  return createBrowserChanApp({
    session,
    token,
    host: "127.0.0.1",
    allowedMcpHosts: [],
    version: "2.0.0",
    maxProfileBytes: 1024,
    maxExtractedProfileBytes: 2048,
  });
};

describe("createBrowserChanApp", () => {
  it("tokenなしのmcpを401で拒否する", async () => {
    const response = await createTestApp().app.request("/mcp", {
      method: "POST",
    });
    assert.equal(response.status, 401);
    assert.equal(
      response.headers.get("WWW-Authenticate"),
      'Bearer realm="browser-chan"',
    );
  });

  it("tokenなしのprofile importとexportを401で拒否する", async () => {
    const app = createTestApp().app;
    assert.equal(
      (await app.request("/profile/import", { method: "POST" })).status,
      401,
    );
    assert.equal((await app.request("/profile/export")).status, 401);
  });

  it("tokenなしのhandを401で拒否する", async () => {
    assert.equal((await createTestApp().app.request("/hand")).status, 401);
  });

  it("healthzは認証なしで200を返す", async () => {
    const response = await createTestApp().app.request("/healthz");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      browserOpen: false,
    });
  });

  it("token付きでもmaliciousなHostとOriginを403で拒否する", async () => {
    const request = new Request("http://evil.example/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Host: "evil.example",
        Origin: "http://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const response = await createTestApp().app.request(request);
    assert.equal(response.status, 403);
  });
});
