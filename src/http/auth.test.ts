import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Hono } from "hono";
import {
  assertTokenPolicy,
  createAuthGate,
  isLoopbackHost,
  readMcpToken,
  verifyBearerToken,
} from "./auth.js";

describe("isLoopbackHost", () => {
  it("127.0.0.1とlocalhostと::1をloopbackと判定する", () => {
    assert.equal(isLoopbackHost("127.0.0.1"), true);
    assert.equal(isLoopbackHost("localhost"), true);
    assert.equal(isLoopbackHost("::1"), true);
    assert.equal(isLoopbackHost("[::1]"), true);
  });

  it("0.0.0.0とLAN IPとhostnameをloopbackではないと判定する", () => {
    assert.equal(isLoopbackHost("0.0.0.0"), false);
    assert.equal(isLoopbackHost("::"), false);
    assert.equal(isLoopbackHost("192.168.1.10"), false);
    assert.equal(isLoopbackHost("127.example.com"), false);
    assert.equal(isLoopbackHost("example.test"), false);
  });
});

describe("verifyBearerToken", () => {
  it("トークン未設定なら認証を要求しない", () => {
    assert.equal(verifyBearerToken(undefined, null), true);
  });

  it("正しいBearerトークンを受け入れる", () => {
    assert.equal(
      verifyBearerToken("Bearer secret-token", "secret-token"),
      true,
    );
  });

  it("誤ったトークンを拒否する", () => {
    assert.equal(
      verifyBearerToken("Bearer wrong-token", "secret-token"),
      false,
    );
  });

  it("Bearer以外の認証方式を拒否する", () => {
    assert.equal(
      verifyBearerToken("Basic secret-token", "secret-token"),
      false,
    );
  });

  it("Authorizationヘッダーなしを拒否する", () => {
    assert.equal(verifyBearerToken(undefined, "secret-token"), false);
    assert.equal(verifyBearerToken("", "secret-token"), false);
  });
});

describe("readMcpToken", () => {
  it("トークンファイルをトークン環境変数より優先する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "browser-chan-auth-"));
    try {
      const tokenFile = join(directory, "token");
      await writeFile(tokenFile, "file-token\n");
      assert.equal(
        readMcpToken({
          BROWSER_CHAN_MCP_TOKEN_FILE: tokenFile,
          BROWSER_CHAN_MCP_TOKEN: "env-token",
        }),
        "file-token",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("トークン未設定ならnullを返す", () => {
    assert.equal(readMcpToken({}), null);
  });

  it("トークンファイルが存在しなければエラーを投げる", () => {
    assert.throws(() =>
      readMcpToken({ BROWSER_CHAN_MCP_TOKEN_FILE: "/does/not/exist" }),
    );
  });
});

describe("assertTokenPolicy", () => {
  it("トークンなしのloopbackを許可する", () => {
    assert.doesNotThrow(() => assertTokenPolicy("127.0.0.1", null));
  });

  it("トークンなしの非loopbackでエラーを投げる", () => {
    assert.throws(() => assertTokenPolicy("0.0.0.0", null));
  });

  it("非loopbackでもトークンがあれば許可する", () => {
    assert.doesNotThrow(() => assertTokenPolicy("0.0.0.0", "secret-token"));
  });
});

describe("createAuthGate", () => {
  const buildApp = (token: string | null) => {
    const app = new Hono();
    app.use("/protected", createAuthGate(token));
    app.get("/protected", (c) => c.text("ok"));
    return app;
  };

  it("トークン設定時に正しいBearerで通す", async () => {
    const response = await buildApp("secret-token").request("/protected", {
      headers: { Authorization: "Bearer secret-token" },
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
  });

  it("トークン設定時に誤ったBearerで401とWWW-Authenticateを返す", async () => {
    const response = await buildApp("secret-token").request("/protected", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    assert.equal(response.status, 401);
    assert.equal(
      response.headers.get("WWW-Authenticate"),
      'Bearer realm="browser-chan"',
    );
  });

  it("トークン未設定時に認証なしで通す", async () => {
    const response = await buildApp(null).request("/protected");
    assert.equal(response.status, 200);
  });
});
