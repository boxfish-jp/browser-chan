import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadServerConfig } from "./config.js";

const profileEnv = { BROWSER_CHAN_PROFILE_DIR: "/tmp/browser-chan-profile" };

describe("loadServerConfig", () => {
  it("既定でhostを127.0.0.1、portを3000にする", () => {
    const config = loadServerConfig({});
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 3000);
  });

  it("0.0.0.0をBROWSER_CHAN_HOSTに指定できる", () => {
    const config = loadServerConfig({
      BROWSER_CHAN_HOST: "0.0.0.0",
      ...profileEnv,
    });
    assert.equal(config.host, "0.0.0.0");
  });

  it("ブラケット付きのBROWSER_CHAN_HOSTを正規化する", () => {
    const config = loadServerConfig({
      BROWSER_CHAN_HOST: "[::1]",
      ...profileEnv,
    });
    assert.equal(config.host, "::1");
  });

  it("不正なBROWSER_CHAN_PORTでエラーを投げる", () => {
    for (const port of ["0", "65536", "abc", "1.5"]) {
      assert.throws(
        () => loadServerConfig({ ...profileEnv, BROWSER_CHAN_PORT: port }),
        /Invalid BROWSER_CHAN_PORT/,
      );
    }
  });

  it("BROWSER_CHAN_PROFILE_DIRの指定を反映する", () => {
    const config = loadServerConfig(profileEnv);
    assert.equal(config.profileDir, "/tmp/browser-chan-profile");
  });
});
