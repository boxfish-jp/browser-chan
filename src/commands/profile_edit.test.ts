import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type BrowserExitResult,
  buildProfileEditLaunchArgs,
  resolveProfileEditExitCode,
  selectExecutablePath,
} from "./profile_edit.js";

const baseOptions = {
  profileDir: "/tmp/browser-chan-profile",
  url: "https://example.com/",
};

const exitResult = (
  code: number | null,
  signal: NodeJS.Signals | null = null,
): BrowserExitResult => ({ type: "exit", code, signal });

const launchErrorResult: BrowserExitResult = {
  type: "error",
  error: new Error("spawn failed"),
};

describe("buildProfileEditLaunchArgs", () => {
  it("プロファイルディレクトリ、最小限のフラグ、URLから起動引数を組み立てる", () => {
    assert.deepEqual(
      buildProfileEditLaunchArgs({ ...baseOptions, isRoot: false }),
      [
        "--user-data-dir=/tmp/browser-chan-profile",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-dev-shm-usage",
        "--password-store=basic",
        "https://example.com/",
      ],
    );
  });

  it("rootのときは--no-sandboxを追加する", () => {
    const args = buildProfileEditLaunchArgs({ ...baseOptions, isRoot: true });
    assert.equal(args.includes("--no-sandbox"), true);
  });

  it("自動化用の起動フラグと--disable-gpu、--headlessを含めない", () => {
    const args = buildProfileEditLaunchArgs({
      ...baseOptions,
      isRoot: true,
    });
    assert.equal(
      args.some(
        (arg) =>
          arg === "--enable-automation" ||
          arg === "--disable-gpu" ||
          arg === "--headless" ||
          arg.startsWith("--remote-debugging-"),
      ),
      false,
    );
  });
});

describe("selectExecutablePath", () => {
  const fallback = () => "/fallback/chrome";

  it("環境変数が未設定ならfallbackを使う", () => {
    assert.equal(selectExecutablePath(undefined, fallback), "/fallback/chrome");
  });

  it("環境変数が空文字か空白だけならfallbackを使う", () => {
    assert.equal(selectExecutablePath("", fallback), "/fallback/chrome");
    assert.equal(selectExecutablePath("   ", fallback), "/fallback/chrome");
  });

  it("環境変数のパスを優先して前後の空白を落とす", () => {
    assert.equal(selectExecutablePath(" /env/chrome ", fallback), "/env/chrome");
  });
});

describe("resolveProfileEditExitCode", () => {
  it("正常終了は0を返す", () => {
    assert.equal(resolveProfileEditExitCode(false, exitResult(0)), 0);
  });

  it("異常終了は1を返す", () => {
    assert.equal(resolveProfileEditExitCode(false, exitResult(1)), 1);
    assert.equal(
      resolveProfileEditExitCode(false, exitResult(null, "SIGTERM")),
      1,
    );
  });

  it("起動失敗は1を返す", () => {
    assert.equal(resolveProfileEditExitCode(false, launchErrorResult), 1);
  });

  it("SIGINTで中断したときは130を返す", () => {
    assert.equal(resolveProfileEditExitCode(true, exitResult(0)), 130);
    assert.equal(resolveProfileEditExitCode(true, exitResult(1)), 130);
    assert.equal(resolveProfileEditExitCode(true, launchErrorResult), 130);
  });
});
