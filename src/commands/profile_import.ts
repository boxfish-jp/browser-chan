import { defaultProfileDir } from "../config.js";
import { importProfile } from "../profile/archive.js";
import { resolveTransferToken, uploadProfile } from "../profile/transfer.js";

export type ProfileImportOptions = {
  archive: string;
  profileDir?: string;
  server?: string;
  token?: string;
  tokenFile?: string;
  force: boolean;
};

export const runProfileImportCommand = async (
  options: ProfileImportOptions,
): Promise<number> => {
  if (options.server && options.profileDir) {
    throw new Error("--server and --profile-dir cannot be used together");
  }
  const result = options.server
    ? await uploadProfile({
        server: options.server,
        token: resolveTransferToken({
          token: options.token,
          tokenFile: options.tokenFile,
        }),
        archive: options.archive,
        force: options.force,
      })
    : await importProfile({
        profileDir: options.profileDir ?? defaultProfileDir(),
        archive: options.archive,
        force: options.force,
      });
  console.log(`プロファイルの保存先: ${result.profileDir}`);
  console.log(
    result.backupDir
      ? `バックアップ: ${result.backupDir}`
      : "バックアップ: なし",
  );
  return 0;
};
