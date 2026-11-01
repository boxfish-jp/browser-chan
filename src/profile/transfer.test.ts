import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { profileEndpoint, resolveTransferToken } from "./transfer.js";

describe("resolveTransferToken", () => {
  it("--tokenを--token-fileより優先する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-token-"));
    try {
      const tokenFile = join(root, "token");
      await writeFile(tokenFile, "file-token");
      assert.equal(
        resolveTransferToken(
          { token: "cli-token", tokenFile },
          { BROWSER_CHAN_MCP_TOKEN: "env-token" },
        ),
        "cli-token",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--token-fileを環境変数より優先する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-token-"));
    try {
      const tokenFile = join(root, "token");
      await writeFile(tokenFile, "file-token");
      assert.equal(
        resolveTransferToken(
          { tokenFile },
          { BROWSER_CHAN_MCP_TOKEN: "env-token" },
        ),
        "file-token",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("環境変数のトークンファイルをトークンより優先する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-token-"));
    try {
      const tokenFile = join(root, "token");
      await writeFile(tokenFile, "file-token");
      assert.equal(
        resolveTransferToken(
          {},
          {
            BROWSER_CHAN_MCP_TOKEN_FILE: tokenFile,
            BROWSER_CHAN_MCP_TOKEN: "env-token",
          },
        ),
        "file-token",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("環境変数のトークンをtrimして返す", () => {
    assert.equal(
      resolveTransferToken({}, { BROWSER_CHAN_MCP_TOKEN: "  env-token \n" }),
      "env-token",
    );
  });

  it("トークンがなければnullを返す", () => {
    assert.equal(resolveTransferToken({}, {}), null);
  });
});

describe("profileEndpoint", () => {
  it("server URLの末尾の/mcpを除去してprofileのURLを作る", () => {
    assert.equal(
      profileEndpoint("http://example.test:3000/mcp/", "export"),
      "http://example.test:3000/profile/export",
    );
    assert.equal(
      profileEndpoint("http://example.test:3000", "import"),
      "http://example.test:3000/profile/import",
    );
  });
});
