import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMcpRequestGuard } from "./mcp_guard.js";

const guardOf = (configuredHost: string, extraHosts: string[] = []) =>
  createMcpRequestGuard(configuredHost, extraHosts);

const requestWith = (host: string, origin?: string): Request =>
  new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      Host: host,
      ...(origin ? { Origin: origin } : {}),
    },
  });

describe("createMcpRequestGuard", () => {
  it("allowlistにあるHostを受け入れる", () => {
    assert.equal(guardOf("127.0.0.1")(requestWith("localhost")), undefined);
  });

  it("allowlistにないHostを403で拒否する", () => {
    assert.equal(
      guardOf("127.0.0.1")(requestWith("evil.example"))?.status,
      403,
    );
  });

  it("allowlistにあるHostでもevilなOriginを403で拒否する", () => {
    assert.equal(
      guardOf("127.0.0.1")(requestWith("localhost", "http://evil.example"))
        ?.status,
      403,
    );
  });

  it("IPリテラルのHostはallowlistになくても受け入れる", () => {
    assert.equal(
      guardOf("127.0.0.1")(requestWith("203.0.113.10:3000")),
      undefined,
    );
    assert.equal(
      guardOf("127.0.0.1")(requestWith("[2001:db8::1]:3000")),
      undefined,
    );
  });

  it("extrasのhost:portと末尾ドットと大文字を正規化する", () => {
    assert.equal(
      guardOf("127.0.0.1", ["Extra.Example.:8443"])(
        requestWith("extra.example"),
      ),
      undefined,
    );
  });

  it("wildcard bindをallowlistに追加しない", () => {
    assert.equal(
      guardOf("0.0.0.0")(requestWith("wildcard.example"))?.status,
      403,
    );
  });

  it("IPリテラルHostでもOrigin検査は行う", () => {
    assert.equal(
      guardOf("0.0.0.0")(requestWith("203.0.113.10", "http://evil.example"))
        ?.status,
      403,
    );
  });
});
