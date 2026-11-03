import { type ChildProcess, spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { defaultProfileDir } from "../paths.js";
import { isProfileLocked } from "../profile/lock.js";

const DEFAULT_URL = "https://www.google.com/";

export type ProfileEditOptions = {
  url?: string;
  profileDir?: string;
  force?: boolean;
};

export type ProfileEditLaunchOptions = {
  profileDir: string;
  url: string;
  isRoot: boolean;
};

export type BrowserExitResult =
  | { type: "exit"; code: number | null; signal: NodeJS.Signals | null }
  | { type: "error"; error: Error };

export const buildProfileEditLaunchArgs = ({
  profileDir,
  url,
  isRoot,
}: ProfileEditLaunchOptions): string[] => [
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-dev-shm-usage",
  "--password-store=basic",
  ...(isRoot ? ["--no-sandbox"] : []),
  url,
];

export const selectExecutablePath = (
  envValue: string | undefined,
  fallback: () => string,
): string => envValue?.trim() || fallback();

const resolveChromiumExecutable = (): string =>
  selectExecutablePath(
    process.env.PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH,
    () => chromium.executablePath(),
  );

const spawnProfileBrowser = (profileDir: string, url: string): ChildProcess =>
  spawn(
    resolveChromiumExecutable(),
    buildProfileEditLaunchArgs({
      profileDir,
      url,
      isRoot: process.getuid?.() === 0,
    }),
    { stdio: "inherit" },
  );

const waitForBrowserExit = (child: ChildProcess): Promise<BrowserExitResult> =>
  new Promise((resolve) => {
    child.once("error", (error) => resolve({ type: "error", error }));
    child.once("exit", (code, signal) =>
      resolve({ type: "exit", code, signal }),
    );
  });

const formatExitStatus = (
  code: number | null,
  signal: NodeJS.Signals | null,
): string =>
  code === null ? `signal ${signal ?? "unknown"}` : `exit ${code}`;

const reportLaunchFailure = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ブラウザの起動に失敗しました: ${message}`);
};

export const resolveProfileEditExitCode = (
  interrupted: boolean,
  result: BrowserExitResult,
): number => {
  if (interrupted) {
    return 130;
  }
  if (result.type === "error") {
    return 1;
  }
  return result.code === 0 ? 0 : 1;
};

export const runProfileEditCommand = async (
  options: ProfileEditOptions,
): Promise<number> => {
  const profileDir = options.profileDir ?? defaultProfileDir();
  const url = options.url ?? DEFAULT_URL;
  if (!options.force && (await isProfileLocked(profileDir))) {
    console.error(
      `Profile is locked by a running browser: ${profileDir}. Use --force to override.`,
    );
    return 1;
  }
  let child: ChildProcess;
  try {
    child = spawnProfileBrowser(profileDir, url);
  } catch (error) {
    reportLaunchFailure(error);
    return 1;
  }
  console.log(`プロファイルの保存先: ${profileDir}`);
  console.log("ウィンドウを閉じるとプロファイルが保存されます。");
  let interrupted = false;
  const onSigint = () => {
    interrupted = true;
    child.kill("SIGINT");
  };
  process.on("SIGINT", onSigint);
  const result = await waitForBrowserExit(child).finally(() => {
    process.removeListener("SIGINT", onSigint);
  });
  const exitCode = resolveProfileEditExitCode(interrupted, result);
  if (exitCode === 0) {
    console.log("プロファイルを保存しました。");
    return 0;
  }
  if (result.type === "error") {
    reportLaunchFailure(result.error);
  } else if (!interrupted && result.code !== 0) {
    console.error(
      `ブラウザが異常終了しました (${formatExitStatus(result.code, result.signal)})`,
    );
  }
  return exitCode;
};
