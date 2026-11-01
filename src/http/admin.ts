import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Hono } from "hono";
import type { BrowserSession } from "../browser/session.js";
import {
  defaultProfileArchiveName,
  exportProfile,
  importProfile,
  ProfileArchiveError,
  ProfileLockedError,
  ProfileTooLargeError,
} from "../profile/archive.js";

export type AdminRoutesOptions = {
  session: BrowserSession;
  maxProfileBytes: number;
  maxExtractedProfileBytes: number;
};

const createTemporaryDir = async (
  profileDir: string,
  prefix: string,
): Promise<string> => {
  const root = dirname(profileDir);
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, prefix));
};

const profileErrorResponse = (
  c: {
    text: (body: string, status: 400 | 409 | 413) => Response;
  },
  error: unknown,
): Response => {
  if (error instanceof ProfileLockedError) {
    return c.text(error.message, 409);
  }
  if (error instanceof ProfileTooLargeError) {
    return c.text(error.message, 413);
  }
  if (error instanceof ProfileArchiveError) {
    return c.text(error.message, 400);
  }
  throw error;
};

const receiveArchive = async (
  body: ReadableStream<Uint8Array> | null,
  destination: string,
  maxBytes: number,
): Promise<void> => {
  if (!body) {
    throw new ProfileArchiveError("Request body is empty");
  }
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) {
        callback(new ProfileTooLargeError(maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(body as unknown as NodeReadableStream),
    limiter,
    createWriteStream(destination, { mode: 0o600 }),
  );
};

export const registerAdminRoutes = (
  app: Hono,
  options: AdminRoutesOptions,
): void => {
  app.post("/profile/import", async (c) => {
    const contentType = c.req.header("Content-Type")?.split(";")[0].trim();
    if (contentType !== "application/gzip") {
      return c.text("Expected application/gzip", 415);
    }
    const contentLength = Number(c.req.header("Content-Length") ?? "0");
    if (
      Number.isFinite(contentLength) &&
      contentLength > options.maxProfileBytes
    ) {
      return c.text(
        `Profile archive exceeds the ${options.maxProfileBytes} byte limit`,
        413,
      );
    }
    const temporaryDir = await createTemporaryDir(
      options.session.profileDir,
      ".browser-chan-import-",
    );
    const archive = join(temporaryDir, "profile.tar.gz");
    try {
      await receiveArchive(c.req.raw.body, archive, options.maxProfileBytes);
      const force = c.req.query("force") === "1";
      const result = await options.session.withSuspended(() =>
        importProfile({
          profileDir: options.session.profileDir,
          archive,
          force,
          maxBytes: options.maxProfileBytes,
          maxExtractedBytes: options.maxExtractedProfileBytes,
        }),
      );
      return c.json(result);
    } catch (error) {
      return profileErrorResponse(c, error);
    } finally {
      await rm(temporaryDir, { recursive: true, force: true });
    }
  });

  app.get("/profile/export", async (c) => {
    const temporaryDir = await createTemporaryDir(
      options.session.profileDir,
      ".browser-chan-export-",
    );
    const name = defaultProfileArchiveName();
    const archive = join(temporaryDir, name);
    try {
      const force = c.req.query("force") === "1";
      await options.session.withSuspended(() =>
        exportProfile({
          profileDir: options.session.profileDir,
          output: archive,
          force,
        }),
      );
      const stream = createReadStream(archive);
      const cleanup = () => {
        void rm(temporaryDir, { recursive: true, force: true }).catch(
          () => undefined,
        );
      };
      stream.once("close", cleanup);
      stream.once("error", cleanup);
      return c.body(Readable.toWeb(stream) as ReadableStream, 200, {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      });
    } catch (error) {
      await rm(temporaryDir, { recursive: true, force: true });
      return profileErrorResponse(c, error);
    }
  });
};
