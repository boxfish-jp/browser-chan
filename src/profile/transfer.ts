import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { validateProfileArchive } from "./archive.js";

const TRANSFER_TIMEOUT_MS = 10 * 60 * 1000;

export type TokenOptions = {
  token?: string;
  tokenFile?: string;
};

export type TransferOptions = {
  server: string;
  token: string | null;
};

export type TransferProfileResult = {
  profileDir: string;
  backupDir: string | null;
};

const readTokenFile = (path: string): string => {
  try {
    const token = readFileSync(path, "utf8").trim();
    if (token.length === 0) {
      throw new Error("token file is empty");
    }
    return token;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read token file: ${reason}`);
  }
};

const nonEmpty = (value: string | undefined): string | null =>
  value?.trim() || null;

export const resolveTransferToken = (
  options: TokenOptions,
  env: NodeJS.ProcessEnv = process.env,
): string | null => {
  const token = nonEmpty(options.token);
  if (token) {
    return token;
  }
  if (options.tokenFile) {
    return readTokenFile(options.tokenFile);
  }
  const tokenFile = nonEmpty(env.BROWSER_CHAN_MCP_TOKEN_FILE);
  if (tokenFile) {
    return readTokenFile(tokenFile);
  }
  return nonEmpty(env.BROWSER_CHAN_MCP_TOKEN);
};

export const profileEndpoint = (
  server: string,
  operation: "import" | "export",
): string => {
  const base = server
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/mcp$/, "");
  return `${base}/profile/${operation}`;
};

const authorizationHeaders = (token: string | null): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};

const readErrorBody = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => "");
  return body.length > 2000 ? `${body.slice(0, 2000)}...[truncated]` : body;
};

export type UploadProfileOptions = TransferOptions & {
  archive: string;
  force: boolean;
};

export const uploadProfile = async (
  options: UploadProfileOptions,
): Promise<TransferProfileResult> => {
  const file = await stat(options.archive).catch(() => null);
  if (!file?.isFile()) {
    throw new Error(`Archive does not exist: ${options.archive}`);
  }
  const url = `${profileEndpoint(options.server, "import")}${
    options.force ? "?force=1" : ""
  }`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...authorizationHeaders(options.token),
      "Content-Type": "application/gzip",
      "Content-Length": String(file.size),
    },
    body: Readable.toWeb(
      createReadStream(options.archive),
    ) as unknown as BodyInit,
    duplex: "half",
    signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
  } as RequestInit & { duplex: "half" });
  if (!response.ok) {
    throw new Error(
      `Import failed (${response.status}): ${await readErrorBody(response)}`,
    );
  }
  return (await response.json()) as TransferProfileResult;
};

export type DownloadProfileOptions = TransferOptions & {
  output: string;
  force: boolean;
};

export const downloadProfile = async (
  options: DownloadProfileOptions,
): Promise<string> => {
  const existing = await stat(options.output).catch(() => null);
  if (existing && !options.force) {
    throw new Error(`Output already exists: ${options.output}`);
  }
  await mkdir(dirname(options.output), { recursive: true });
  const part = `${options.output}.part`;
  const url = `${profileEndpoint(options.server, "export")}${
    options.force ? "?force=1" : ""
  }`;
  const response = await fetch(url, {
    headers: authorizationHeaders(options.token),
    signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Export failed (${response.status}): ${await readErrorBody(response)}`,
    );
  }
  if (!response.body) {
    throw new Error("Export response did not contain a body");
  }
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      createWriteStream(part, { mode: 0o600 }),
    );
    await validateProfileArchive(part);
    await rename(part, options.output);
    return options.output;
  } catch (error) {
    await rm(part, { force: true }).catch(() => undefined);
    throw error;
  }
};
