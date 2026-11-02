#!/usr/bin/env node
import { runArchiveCommand } from "./archive_commands.js";

const [command = "", ...rest] = process.argv.slice(2);
try {
  process.exitCode = await runArchiveCommand(command, rest);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
