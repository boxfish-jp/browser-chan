import { lstat, readlink } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

export class ProfileLockedError extends Error {
  constructor(profileDir: string) {
    super(`Profile is locked by a running browser: ${profileDir}`);
    this.name = "ProfileLockedError";
  }
}

export const parseSingletonLockTarget = (
  target: string | null,
): { hostname: string; pid: number } | null => {
  if (!target) {
    return null;
  }
  const match = /^(.+)-(\d+)$/.exec(target);
  if (!match) {
    return null;
  }
  const pid = Number(match[2]);
  if (!Number.isSafeInteger(pid) || pid < 1) {
    return null;
  }
  return { hostname: match[1], pid };
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

export const isProfileLocked = async (profileDir: string): Promise<boolean> => {
  const lock = await lstat(join(profileDir, "SingletonLock")).catch(() => null);
  if (!lock) {
    return false;
  }
  const target = await readlink(join(profileDir, "SingletonLock")).catch(
    () => null,
  );
  const parsed = parseSingletonLockTarget(target);
  if (parsed && parsed.hostname === hostname() && !isProcessAlive(parsed.pid)) {
    return false;
  }
  return true;
};
