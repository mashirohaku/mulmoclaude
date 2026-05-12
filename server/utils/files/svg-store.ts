import path from "path";
import { workspacePath } from "../../workspace/workspace.js";
import { WORKSPACE_DIRS } from "../../workspace/paths.js";
import { writeFileAtomic } from "./atomic.js";

// Defence in depth: validate the path here too, not only at the route
// gate. If a future caller ever forgets to pre-check via `isSvgPath`,
// `path.join(workspacePath, relativePath)` would happily produce a
// traversal escape. Re-checking inside the write helper closes that
// trust chain.
export async function overwriteSvg(relativePath: string, content: string): Promise<void> {
  if (!isSvgPath(relativePath)) {
    throw new Error(`invalid svg path: ${relativePath}`);
  }
  const absPath = path.join(workspacePath, relativePath);
  await writeFileAtomic(absPath, content);
}

// Strict — primary defence for the route's PUT path.
export function isSvgPath(value: string): boolean {
  if (!value.startsWith(`${WORKSPACE_DIRS.svgs}/`)) return false;
  if (!value.endsWith(".svg")) return false;
  const normalized = path.posix.normalize(value);
  if (normalized !== value) return false;
  if (normalized.includes("..")) return false;
  return true;
}
