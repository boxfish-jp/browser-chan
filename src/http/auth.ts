import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import type { MiddlewareHandler } from "hono";

const LOOPBACK_HOSTS = new Set(["localhost", "::1", "127.0.0.1"]);

export const isLoopbackHost = (host: string): boolean => {
  const normalized = host
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .toLowerCase();
  return (
    LOOPBACK_HOSTS.has(normalized) ||
    (isIP(normalized) === 4 && normalized.startsWith("127."))
  );
};

const sha256 = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

export const readMcpToken = (
  env: NodeJS.ProcessEnv = process.env,
): string | null => {
  const tokenFile = env.BROWSER_CHAN_MCP_TOKEN_FILE?.trim();
  if (tokenFile) {
    try {
      const token = readFileSync(tokenFile, "utf8").trim();
      if (token.length === 0) {
        throw new Error("token file is empty");
      }
      return token;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read BROWSER_CHAN_MCP_TOKEN_FILE: ${reason}`);
    }
  }
  const token = env.BROWSER_CHAN_MCP_TOKEN?.trim();
  return token ? token : null;
};

export const assertTokenPolicy = (host: string, token: string | null): void => {
  if (token === null && !isLoopbackHost(host)) {
    throw new Error(
      `Refusing to listen on ${host} without an MCP token. Set BROWSER_CHAN_MCP_TOKEN_FILE or BROWSER_CHAN_MCP_TOKEN.`,
    );
  }
};

export const verifyBearerToken = (
  authorization: string | undefined,
  token: string | null,
): boolean => {
  if (token === null) {
    return true;
  }
  if (!authorization) {
    return false;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) {
    return false;
  }
  const provided = sha256(match[1].trim());
  const expected = sha256(token);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
};

export const createAuthGate =
  (token: string | null): MiddlewareHandler =>
  async (c, next) => {
    if (verifyBearerToken(c.req.header("Authorization"), token)) {
      await next();
      return;
    }
    c.header("WWW-Authenticate", 'Bearer realm="browser-chan"');
    return c.text("Unauthorized", 401);
  };
