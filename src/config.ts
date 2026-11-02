import { defaultProfileDir } from "./paths.js";

export type ServerConfig = {
  host: string;
  port: number;
  profileDir: string;
};

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

const normalizeHost = (value: string): string =>
  value.replace(/^\[/, "").replace(/\]$/, "");

export const loadServerConfig = (
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig => {
  const host = normalizeHost(env.BROWSER_CHAN_HOST?.trim() || "127.0.0.1");
  const profileDir =
    env.BROWSER_CHAN_PROFILE_DIR?.trim() || defaultProfileDir();
  return {
    host,
    port: parsePort(env.BROWSER_CHAN_PORT),
    profileDir,
  };
};
