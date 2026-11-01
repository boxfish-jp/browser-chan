import { parseArgs } from "node:util";
import { runProfileEditCommand } from "./commands/profile_edit.js";
import { runProfileExportCommand } from "./commands/profile_export.js";
import { runProfileImportCommand } from "./commands/profile_import.js";
import { runServerCommand } from "./commands/server.js";
import { VERSION } from "./version.js";

const MAIN_HELP = `browser-chan ${VERSION}

Usage:
  browser-chan [mcp]
  browser-chan profile-edit [url] [options]
  browser-chan profile-export [options]
  browser-chan profile-import <archive> [options]

Commands:
  mcp             Start the MCP and legacy HTTP server (default)
  profile-edit    Open a local Chromium window and save the profile
  profile-export  Export the profile to a tar.gz archive
  profile-import  Import a tar.gz archive into the profile directory

Run a command with --help for its options.`;

const PROFILE_EDIT_HELP = `Usage: browser-chan profile-edit [url] [options]

Options:
  --profile-dir <dir>  Profile directory (default: ~/.local/share/browser-chan)
  --force              Open even when the profile looks locked
  -h, --help           Show this help`;

const PROFILE_EXPORT_HELP = `Usage: browser-chan profile-export [options]

Options:
  -o, --output <file>    Output archive (default: browser-chan-profile-YYYYMMDD-HHmmss.tar.gz)
  --profile-dir <dir>    Profile directory
  --server <url>         Export from a running server over HTTP
  --token <token>        Bearer token (prefer BROWSER_CHAN_MCP_TOKEN)
  --token-file <file>    File containing the bearer token
  --force                Overwrite an existing output and bypass the lock check
  -h, --help             Show this help`;

const PROFILE_IMPORT_HELP = `Usage: browser-chan profile-import <archive> [options]

Options:
  --profile-dir <dir>    Profile directory
  --server <url>         Import into a running server over HTTP
  --token <token>        Bearer token (prefer BROWSER_CHAN_MCP_TOKEN)
  --token-file <file>    File containing the bearer token
  --force                Replace a locked profile
  -h, --help             Show this help`;

const parseOrReport = <T extends Record<string, unknown>>(
  config: Parameters<typeof parseArgs>[0],
): T | null => {
  try {
    return parseArgs(config) as unknown as T;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return null;
  }
};

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

const runProfileEdit = async (args: string[]): Promise<number> => {
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
    console.log(PROFILE_EDIT_HELP);
    return 0;
  }
  if (parsed.positionals.length > 1) {
    console.error("profile-edit accepts at most one URL");
    return 1;
  }
  return runProfileEditCommand({
    url: parsed.positionals[0],
    profileDir: parsed.values["profile-dir"],
    force: parsed.values.force ?? false,
  });
};

const runProfileExport = async (args: string[]): Promise<number> => {
  const parsed = parseOrReport<{
    values: {
      help?: boolean;
      output?: string;
      "profile-dir"?: string;
      server?: string;
      token?: string;
      "token-file"?: string;
      force?: boolean;
    };
    positionals: string[];
  }>({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      output: { type: "string", short: "o" },
      "profile-dir": { type: "string" },
      server: { type: "string" },
      token: { type: "string" },
      "token-file": { type: "string" },
      force: { type: "boolean" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed) {
    return 1;
  }
  if (parsed.values.help) {
    console.log(PROFILE_EXPORT_HELP);
    return 0;
  }
  return runProfileExportCommand({
    output: parsed.values.output,
    profileDir: parsed.values["profile-dir"],
    server: parsed.values.server,
    token: parsed.values.token,
    tokenFile: parsed.values["token-file"],
    force: parsed.values.force ?? false,
  });
};

const runProfileImport = async (args: string[]): Promise<number> => {
  const parsed = parseOrReport<{
    values: {
      help?: boolean;
      "profile-dir"?: string;
      server?: string;
      token?: string;
      "token-file"?: string;
      force?: boolean;
    };
    positionals: string[];
  }>({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      "profile-dir": { type: "string" },
      server: { type: "string" },
      token: { type: "string" },
      "token-file": { type: "string" },
      force: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (!parsed) {
    return 1;
  }
  if (parsed.values.help) {
    console.log(PROFILE_IMPORT_HELP);
    return 0;
  }
  if (parsed.positionals.length !== 1) {
    console.error("profile-import requires exactly one archive path");
    return 1;
  }
  return runProfileImportCommand({
    archive: parsed.positionals[0],
    profileDir: parsed.values["profile-dir"],
    server: parsed.values.server,
    token: parsed.values.token,
    tokenFile: parsed.values["token-file"],
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
    if (command === "profile-edit") {
      return await runProfileEdit(rest);
    }
    if (command === "profile-export") {
      return await runProfileExport(rest);
    }
    if (command === "profile-import") {
      return await runProfileImport(rest);
    }
    console.error(`Unknown command: ${command}`);
    printMainHelp();
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};
