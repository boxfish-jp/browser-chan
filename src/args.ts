import { parseArgs } from "node:util";

export const parseOrReport = <T extends Record<string, unknown>>(
  config: Parameters<typeof parseArgs>[0],
): T | null => {
  try {
    return parseArgs(config) as unknown as T;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return null;
  }
};
