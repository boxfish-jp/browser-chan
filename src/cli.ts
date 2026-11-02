import { parseOrReport } from "./args.js";
import { runProfileEditCommand } from "./commands/profile_edit.js";
import { runServerCommand } from "./commands/server.js";
import { VERSION } from "./version.js";

const MAIN_HELP = `browser-chan ${VERSION}

Usage:
  browser-chan [mcp]
  browser-chan edit [url] [options]
  browser-chan export [options]
  browser-chan import <archive> [options]

Commands:
  mcp     Start the MCP and legacy HTTP server (default)
  edit    Open a local Chromium window and save the profile
  export  Export the profile to a tar.gz archive
  import  Import a tar.gz archive into the profile directory

Run a command with --help for its options.`;

const EDIT_HELP = `Usage: browser-chan edit [url] [options]

Options:
  --profile-dir <dir>  Profile directory (default: ~/.local/share/browser-chan)
  --force              Open even when the profile looks locked
  -h, --help           Show this help`;

const printMainHelp = () => console.log(MAIN_HELP);

const runMcp = async (args: string[]): Promise<number> => {
  const parsed = parseOrReport<{ values: { help?: boolean } }>({
    args,
    options: {
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed) {
    return 1;
  }
  if (parsed.values.help) {
    printMainHelp();
    return 0;
  }
  return runServerCommand();
};

const runEdit = async (args: string[]): Promise<number> => {
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
    console.log(EDIT_HELP);
    return 0;
  }
  if (parsed.positionals.length > 1) {
    console.error("edit accepts at most one URL");
    return 1;
  }
  return runProfileEditCommand({
    url: parsed.positionals[0],
    profileDir: parsed.values["profile-dir"],
    force: parsed.values.force ?? false,
  });
};

export const runCli = async (argv: string[]): Promise<number> => {
  if (argv.length === 0) {
    return runServerCommand();
  }
  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h") {
    printMainHelp();
    return 0;
  }
  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return 0;
  }
  try {
    if (command === "mcp") {
      return await runMcp(rest);
    }
    if (command === "edit") {
      return await runEdit(rest);
    }
    if (command === "export" || command === "import") {
      const { runArchiveCommand } = await import("../cli/archive_commands.js");
      return await runArchiveCommand(command, rest);
    }
    console.error(`Unknown command: ${command}`);
    printMainHelp();
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};
