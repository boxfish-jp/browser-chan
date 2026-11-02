import { chromium } from "playwright-core";
import { defaultProfileDir } from "../paths.js";
import { isProfileLocked } from "../profile/lock.js";

export type ProfileEditOptions = {
  url?: string;
  profileDir?: string;
  force?: boolean;
};

export const runProfileEditCommand = async (
  options: ProfileEditOptions,
): Promise<number> => {
  const profileDir = options.profileDir ?? defaultProfileDir();
  const url = options.url ?? "https://www.google.com/";
  if (!options.force && (await isProfileLocked(profileDir))) {
    console.error(
      `Profile is locked by a running browser: ${profileDir}. Use --force to override.`,
    );
    return 1;
  }
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: ["--disable-gpu", "--disable-dev-shm-usage"],
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  console.log(`プロファイルの保存先: ${profileDir}`);
  console.log("ウィンドウを閉じるとプロファイルが保存されます。");
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url);
  let interrupted = false;
  const onSigint = () => {
    interrupted = true;
    void context.close().catch(() => undefined);
  };
  process.once("SIGINT", onSigint);
  await new Promise<void>((resolve) => {
    context.once("close", () => resolve());
  });
  process.removeListener("SIGINT", onSigint);
  await context.close().catch(() => undefined);
  if (interrupted) {
    return 130;
  }
  console.log("プロファイルを保存しました。");
  return 0;
};
