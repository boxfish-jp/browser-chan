import { runExportCommand } from "./export.js";
import { runImportCommand } from "./import.js";

const ARCHIVE_USAGE = `Usage:
  browser-chan export [options]
  browser-chan import <archive> [options]

Commands:
  export  Export the profile to a tar.gz archive
  import  Import a tar.gz archive into the profile directory`;

const commandHandlers = new Map<string, (args: string[]) => Promise<number>>([
  ["export", runExportCommand],
  ["import", runImportCommand],
]);

export const runArchiveCommand = async (
  command: string,
  args: string[],
): Promise<number> => {
  const handler = commandHandlers.get(command);
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error(ARCHIVE_USAGE);
    return 1;
  }
  return handler(args);
};
