import { defaultProfileDir } from "../config.js";
import {
  defaultProfileArchiveName,
  exportProfile,
} from "../profile/archive.js";
import { downloadProfile, resolveTransferToken } from "../profile/transfer.js";

export type ProfileExportOptions = {
  output?: string;
  profileDir?: string;
  server?: string;
  token?: string;
  tokenFile?: string;
  force: boolean;
};

export const runProfileExportCommand = async (
  options: ProfileExportOptions,
): Promise<number> => {
  if (options.server && options.profileDir) {
    throw new Error("--server and --profile-dir cannot be used together");
  }
  const output = options.output ?? defaultProfileArchiveName();
  if (options.server) {
    const saved = await downloadProfile({
      server: options.server,
      token: resolveTransferToken({
        token: options.token,
        tokenFile: options.tokenFile,
      }),
      output,
      force: options.force,
    });
    console.log(`プロファイルを書き出しました: ${saved}`);
    return 0;
  }
  const saved = await exportProfile({
    profileDir: options.profileDir ?? defaultProfileDir(),
    output,
    force: options.force,
  });
  console.log(`プロファイルを書き出しました: ${saved}`);
  return 0;
};
