import { homedir } from "node:os";
import { join } from "node:path";
import { assertTokenPolicy, readMcpToken } from "./http/auth.js";
import {
  DEFAULT_PROFILE_MAX_BYTES,
  DEFAULT_PROFILE_MAX_EXTRACTED_BYTES,
} from "./profile/archive.js";

export type ServerConfig = {
  host: string;
  port: number;
  profileDir: string;
  token: string | null;
  maxProfileBytes: number;
  maxExtractedProfileBytes: number;
  allowedMcpHosts: string[];
};

export const defaultProfileDir = (): string =>
  join(homedir(), ".local/share/browser-chan");

const parsePort = (value: string | undefined): number => {
  if (value === undefined || value.trim() === "") {
    return 3000;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid BROWSER_CHAN_PORT: ${value}`);
  }
  return port;
};

const parseByteSize = (
  value: string | undefined,
  fallback: number,
  name: string,
): number => {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return size;
};

const parseAllowedMcpHosts = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);

export const loadServerConfig = (
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig => {
  const host = env.BROWSER_CHAN_HOST?.trim() || "127.0.0.1";
  const profileDir =
    env.BROWSER_CHAN_PROFILE_DIR?.trim() || defaultProfileDir();
  const token = readMcpToken(env);
  assertTokenPolicy(host, token);
  return {
    host,
    port: parsePort(env.BROWSER_CHAN_PORT),
    profileDir,
    token,
    maxProfileBytes: parseByteSize(
      env.BROWSER_CHAN_PROFILE_MAX_BYTES,
      DEFAULT_PROFILE_MAX_BYTES,
      "BROWSER_CHAN_PROFILE_MAX_BYTES",
    ),
    maxExtractedProfileBytes: parseByteSize(
      env.BROWSER_CHAN_PROFILE_MAX_EXTRACTED_BYTES,
      DEFAULT_PROFILE_MAX_EXTRACTED_BYTES,
      "BROWSER_CHAN_PROFILE_MAX_EXTRACTED_BYTES",
    ),
    allowedMcpHosts: parseAllowedMcpHosts(env.BROWSER_CHAN_MCP_ALLOWED_HOSTS),
  };
};
