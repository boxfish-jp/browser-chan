import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isProfileLocked, parseSingletonLockTarget } from "./lock.js";

describe("parseSingletonLockTarget", () => {
  it("hostname-pid形式を解析する", () => {
    assert.deepEqual(parseSingletonLockTarget("my-host-1234"), {
      hostname: "my-host",
      pid: 1234,
    });
  });

  it("PIDを含まないtargetを拒否する", () => {
    assert.equal(parseSingletonLockTarget("my-host"), null);
    assert.equal(parseSingletonLockTarget("my-host-not-a-pid"), null);
    assert.equal(parseSingletonLockTarget(null), null);
  });
});

describe("isProfileLocked", () => {
  it("SingletonLockがなければCookieだけではロックと判定しない", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-lock-"));
    try {
      const profileDir = join(root, "profile");
      await mkdir(profileDir);
      await writeFile(join(profileDir, "SingletonCookie"), "cookie");
      assert.equal(await isProfileLocked(profileDir), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
