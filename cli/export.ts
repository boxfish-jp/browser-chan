import { parseOrReport } from "../src/args.js";
import { defaultProfileDir } from "../src/paths.js";
import { defaultProfileArchiveName, exportProfile } from "./profile/archive.js";

const EXPORT_HELP = `Usage: browser-chan export [options]

Options:
  -o, --output <file>  Output archive (default: browser-chan-profile-YYYYMMDD-HHmmss.tar.gz)
  --profile-dir <dir>  Profile directory
  --force              Overwrite an existing output and bypass the lock check
  -h, --help           Show this help`;

export const runExportCommand = async (args: string[]): Promise<number> => {
  const parsed = parseOrReport<{
    values: {
      help?: boolean;
      output?: string;
      "profile-dir"?: string;
      force?: boolean;
    };
    positionals: string[];
  }>({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      output: { type: "string", short: "o" },
      "profile-dir": { type: "string" },
      force: { type: "boolean" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed) {
    return 1;
  }
  if (parsed.values.help) {
    console.log(EXPORT_HELP);
    return 0;
  }
  const saved = await exportProfile({
    profileDir: parsed.values["profile-dir"] ?? defaultProfileDir(),
    output: parsed.values.output ?? defaultProfileArchiveName(),
    force: parsed.values.force ?? false,
  });
  console.log(`プロファイルを書き出しました: ${saved}`);
  return 0;
};
