import { execFile, spawn } from "node:child_process";
import {
  chmod,
  chown,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { isProfileLocked, ProfileLockedError } from "../../src/profile/lock.js";

export { ProfileLockedError };

const execFileAsync = promisify(execFile);
const LOCK_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
const MAX_ARCHIVE_ENTRIES = 100_000;
const TAR_MAX_BUFFER = 64 * 1024 * 1024;
const CACHE_EXCLUDES = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "GrShaderCache",
  "ShaderCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "Crashpad",
  "Service Worker/CacheStorage",
  "Service Worker/ScriptCache",
];

export class ProfileArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileArchiveError";
  }
}

export const formatTimestamp = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

export const defaultProfileArchiveName = (date = new Date()): string =>
  `browser-chan-profile-${formatTimestamp(date)}.tar.gz`;

export const isSafeArchiveEntry = (entry: string): boolean => {
  if (entry.includes("\0")) {
    return false;
  }
  const normalized = entry.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    return false;
  }
  if (/^[A-Za-z]:/.test(normalized)) {
    return false;
  }
  return normalized.split("/").every((segment) => segment !== "..");
};

export const isChromiumProfileEntry = (entry: string): boolean => {
  const normalized = entry
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
  return (
    normalized === "Local State" ||
    normalized === "Default" ||
    normalized.startsWith("Default/")
  );
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

const assertUnlocked = async (
  profileDir: string,
  force: boolean,
): Promise<void> => {
  if (!force && (await isProfileLocked(profileDir))) {
    throw new ProfileLockedError(profileDir);
  }
};

const runTar = (args: string[]): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("tar", args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, LC_ALL: "C" },
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => rejectPromise(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `tar exited with ${code}: ${stderr.trim() || "unknown error"}`,
        ),
      );
    });
  });

const archiveEntries = async (archive: string): Promise<string[]> => {
  const { stdout } = await execFileAsync("tar", ["-tzf", archive], {
    env: { ...process.env, LC_ALL: "C" },
    encoding: "utf8",
    maxBuffer: TAR_MAX_BUFFER,
  });
  return stdout.split("\n").filter((line) => line.length > 0);
};

const archiveTypes = async (archive: string): Promise<string[]> => {
  const { stdout } = await execFileAsync("tar", ["-tvzf", archive], {
    env: { ...process.env, LC_ALL: "C" },
    encoding: "utf8",
    maxBuffer: TAR_MAX_BUFFER,
  });
  return stdout.split("\n").filter((line) => line.length > 0);
};

export const validateProfileArchive = async (
  archive: string,
): Promise<void> => {
  const file = await stat(archive).catch(() => null);
  if (!file?.isFile()) {
    throw new ProfileArchiveError(`Archive does not exist: ${archive}`);
  }
  let entries: string[];
  try {
    entries = await archiveEntries(archive);
  } catch (error) {
    throw new ProfileArchiveError(
      `Invalid gzip archive: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (entries.length === 0) {
    throw new ProfileArchiveError("Archive is empty");
  }
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new ProfileArchiveError(
      `Archive has more than ${MAX_ARCHIVE_ENTRIES} entries`,
    );
  }
  for (const entry of entries) {
    if (!isSafeArchiveEntry(entry)) {
      throw new ProfileArchiveError(`Unsafe archive entry: ${entry}`);
    }
  }
  let types: string[];
  try {
    types = await archiveTypes(archive);
  } catch (error) {
    throw new ProfileArchiveError(
      `Invalid archive metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (types.length !== entries.length) {
    throw new ProfileArchiveError("Archive listing is inconsistent");
  }
  for (const line of types) {
    const kind = line[0];
    if (kind !== "-" && kind !== "d") {
      throw new ProfileArchiveError(
        `Archive contains an unsupported entry type: ${line}`,
      );
    }
  }
};

export type ExportProfileOptions = {
  profileDir: string;
  output: string;
  force?: boolean;
};

export const exportProfile = async (
  options: ExportProfileOptions,
): Promise<string> => {
  const profileDir = resolve(options.profileDir);
  const output = resolve(options.output);
  const force = options.force ?? false;
  const profile = await stat(profileDir).catch(() => null);
  if (!profile?.isDirectory()) {
    throw new ProfileArchiveError(
      `Profile directory does not exist: ${profileDir}`,
    );
  }
  await assertUnlocked(profileDir, force);
  if (output === profileDir || output.startsWith(`${profileDir}${sep}`)) {
    throw new ProfileArchiveError(
      "The export destination must not be inside the profile directory",
    );
  }
  if (!force && (await exists(output))) {
    throw new ProfileArchiveError(`Output already exists: ${output}`);
  }
  await mkdir(dirname(output), { recursive: true });
  const excludes = [
    ...LOCK_FILES.map((file) => `--exclude=${file}`),
    ...CACHE_EXCLUDES.map((entry) => `--exclude=${entry}`),
  ];
  try {
    await runTar(["-C", profileDir, ...excludes, "-czf", output, "."]);
    await chmod(output, 0o600);
    return output;
  } catch (error) {
    await rm(output, { force: true }).catch(() => undefined);
    if (
      error instanceof ProfileArchiveError ||
      error instanceof ProfileLockedError
    ) {
      throw error;
    }
    throw new ProfileArchiveError(
      `Failed to export profile: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export type ImportProfileOptions = {
  profileDir: string;
  archive: string;
  force?: boolean;
};

export type ImportProfileResult = {
  profileDir: string;
  backupDir: string | null;
};

const backupPath = async (profileDir: string): Promise<string> => {
  const base = `${profileDir}.backup-${formatTimestamp(new Date())}`;
  if (!(await exists(base))) {
    return base;
  }
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
};

const chownRecursive = async (
  path: string,
  uid: number,
  gid: number,
): Promise<void> => {
  await chown(path, uid, gid);
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      await chownRecursive(child, uid, gid);
    } else {
      await chown(child, uid, gid).catch(() => undefined);
    }
  }
};

export const importProfile = async (
  options: ImportProfileOptions,
): Promise<ImportProfileResult> => {
  const profileDir = resolve(options.profileDir);
  const archive = resolve(options.archive);
  const force = options.force ?? false;
  if (profileDir === resolve("/") || profileDir === resolve(homedir())) {
    throw new ProfileArchiveError(`Refusing to import into ${profileDir}`);
  }
  const profileLink = await lstat(profileDir).catch(() => null);
  if (profileLink?.isSymbolicLink()) {
    throw new ProfileArchiveError(
      `Profile directory must not be a symbolic link: ${profileDir}`,
    );
  }
  await assertUnlocked(profileDir, force);
  await validateProfileArchive(archive);
  const parent = dirname(profileDir);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(join(parent, ".browser-chan-staging-"));
  const original = await stat(profileDir).catch(() => null);
  const backup = await backupPath(profileDir);
  let backupCreated = false;
  let installed = false;
  try {
    await runTar([
      "-xzf",
      archive,
      "-C",
      staging,
      "--no-same-owner",
      "--no-same-permissions",
    ]);
    const entries = await readdir(staging);
    if (!entries.some(isChromiumProfileEntry)) {
      throw new ProfileArchiveError(
        "Archive does not contain a Chromium profile",
      );
    }
    if (original) {
      await rename(profileDir, backup);
      backupCreated = true;
    }
    await rename(staging, profileDir);
    installed = true;
    if (process.getuid?.() === 0) {
      const owner = original ?? (await stat(parent).catch(() => null));
      if (owner) {
        await chownRecursive(profileDir, owner.uid, owner.gid);
      }
    }
    return {
      profileDir,
      backupDir: backupCreated ? backup : null,
    };
  } catch (error) {
    if (installed) {
      await rm(profileDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    if (backupCreated) {
      await rename(backup, profileDir).catch(() => undefined);
    }
    if (
      error instanceof ProfileArchiveError ||
      error instanceof ProfileLockedError
    ) {
      throw error;
    }
    throw new ProfileArchiveError(
      `Failed to import profile: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
};
