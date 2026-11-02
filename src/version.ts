import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJsonCandidates = [
  fileURLToPath(new URL("../package.json", import.meta.url)),
  fileURLToPath(new URL("../../package.json", import.meta.url)),
];
const packageJsonPath = packageJsonCandidates.find((candidate) =>
  existsSync(candidate),
);
if (!packageJsonPath) {
  throw new Error(
    `package.json not found: ${packageJsonCandidates.join(", ")}`,
  );
}
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  version: string;
};

export const VERSION = packageJson.version;
