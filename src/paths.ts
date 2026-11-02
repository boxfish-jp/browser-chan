import { homedir } from "node:os";
import { join } from "node:path";

export const defaultProfileDir = (): string =>
  join(homedir(), ".local/share/browser-chan");
