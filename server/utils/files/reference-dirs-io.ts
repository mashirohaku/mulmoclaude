import { mkdirSync, statSync } from "fs";
import path from "path";
import { WORKSPACE_DIRS, workspacePath } from "../../workspace/paths.js";
import { loadJsonFile, writeJsonAtomicSync } from "./json.js";
import { log } from "../../system/logger/index.js";

const CONFIG_FILE_NAME = "reference-dirs.json";

function configPath(root: string): string {
  return path.join(root, WORKSPACE_DIRS.configs, CONFIG_FILE_NAME);
}

// Returns [] on missing/corrupt file.
export function readReferenceDirsJson(root?: string): unknown[] {
  const filePath = configPath(root ?? workspacePath);
  const parsed = loadJsonFile<unknown>(filePath, []);
  if (!Array.isArray(parsed)) {
    log.warn("reference-dirs-io", "reference-dirs.json is not an array");
    return [];
  }
  return parsed;
}

export function writeReferenceDirsJson(entries: readonly unknown[], root?: string): void {
  const filePath = configPath(root ?? workspacePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonAtomicSync(filePath, entries);
}

export function isExistingDirectory(hostPath: string): boolean {
  try {
    return statSync(hostPath).isDirectory();
  } catch {
    return false;
  }
}
