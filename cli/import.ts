import { parseOrReport } from "../src/args.js";
import { defaultProfileDir } from "../src/paths.js";
import { importProfile } from "./profile/archive.js";

const IMPORT_HELP = `Usage: browser-chan import <archive> [options]

Options:
  --profile-dir <dir>  Profile directory
  --force              Replace a locked profile
  -h, --help           Show this help`;

export const runImportCommand = async (args: string[]): Promise<number> => {
  const parsed = parseOrReport<{
    values: { help?: boolean; "profile-dir"?: string; force?: boolean };
    positionals: string[];
  }>({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      "profile-dir": { type: "string" },
      force: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (!parsed) {
    return 1;
  }
  if (parsed.values.help) {
    console.log(IMPORT_HELP);
    return 0;
  }
  if (parsed.positionals.length !== 1) {
    console.error("import requires exactly one archive path");
    return 1;
  }
  const result = await importProfile({
    profileDir: parsed.values["profile-dir"] ?? defaultProfileDir(),
    archive: parsed.positionals[0],
    force: parsed.values.force ?? false,
  });
  console.log(`プロファイルの保存先: ${result.profileDir}`);
  console.log(
    result.backupDir
      ? `バックアップ: ${result.backupDir}`
      : "バックアップ: なし",
  );
  return 0;
};
