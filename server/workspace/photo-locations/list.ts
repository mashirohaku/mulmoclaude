// List all photo-location sidecars under the workspace
// (`data/locations/<YYYY>/<MM>/<id>.json`). Pure I/O — no schema
// validation, no projection. The caller (HTTP route or a future
// LLM tool) decides what to do with the rows.
//
// Sidecars are written by the post-save hook in `./index.ts`; this
// is the "read everything back" counterpart for queries like
// "list all my photo locations" or "render every captured pin on
// a map view".

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_DIRS, WORKSPACE_PATHS } from "../paths.js";
import { log } from "../../system/logger/index.js";
import type { PhotoLocationSidecar } from "./index.js";

/** A sidecar paired with the id used in the filename. The id is the
 *  attachment's stable identifier; consumers (UI, LLM) use it to
 *  cross-reference the original photo in `data/attachments/`. */
export interface ListedSidecar {
  id: string;
  /** Workspace-relative sidecar path (posix slashes). */
  relativePath: string;
  sidecar: PhotoLocationSidecar;
}

const SIDECAR_EXT = ".json";

/** Walk `data/locations/` and return every successfully-parsed
 *  sidecar. Skips any file that fails to parse — `log.warn` notes
 *  the path so an operator can investigate without the listing
 *  crashing. */
export async function listAllSidecars(): Promise<ListedSidecar[]> {
  const root = WORKSPACE_PATHS.locations;
  const yearDirs = await readSubdirsSafe(root);
  const all: ListedSidecar[] = [];
  for (const year of yearDirs) {
    const yearAbs = path.join(root, year);
    const monthDirs = await readSubdirsSafe(yearAbs);
    for (const month of monthDirs) {
      const monthAbs = path.join(yearAbs, month);
      const sidecars = await readSidecarsInDir(monthAbs, year, month);
      all.push(...sidecars);
    }
  }
  // Newest first by capturedAt (the wall-clock when the sidecar
  // was written). takenAt would be more semantically right but
  // can be missing; capturedAt is always present.
  all.sort((left, right) => right.sidecar.capturedAt.localeCompare(left.sidecar.capturedAt));
  return all;
}

/** Count of sidecars that pass the same shape validation as
 *  `listAllSidecars` — so the plugin's status badge agrees with
 *  what the list endpoint will actually return. The earlier
 *  cheap-walk version drifted out of parity once a malformed
 *  sidecar appeared on disk (`list` skipped it, `count` still
 *  totalled it). On workspaces with thousands of sidecars the
 *  parse cost is still a small fraction of the listing one and
 *  worth the consistency. (Codex review on PR #1263.) */
export async function countAllSidecars(): Promise<number> {
  return (await listAllSidecars()).length;
}

/** Defensive shape check for one sidecar JSON. The post-save hook
 *  always writes a well-shaped object, but a hand-edited or
 *  partially-truncated file mustn't crash the listing endpoint —
 *  `localeCompare` on a missing `capturedAt` would throw at sort
 *  time and 500 the request. Return `null` instead so the caller
 *  skips the row with a `log.warn`. (Codex review on PR #1250.) */
function validateSidecarShape(value: unknown): PhotoLocationSidecar | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  if (typeof record.capturedAt !== "string") return null;
  const { photo } = record;
  if (!photo || typeof photo !== "object") return null;
  const photoRecord = photo as Record<string, unknown>;
  if (typeof photoRecord.relativePath !== "string") return null;
  if (typeof photoRecord.mimeType !== "string") return null;
  // `exif` is required as an object but its individual fields are
  // all optional — the View / LLM handle the lat/lng-missing case
  // already (only-altitude photos exist).
  if (!record.exif || typeof record.exif !== "object") return null;
  return record as unknown as PhotoLocationSidecar;
}

async function readSubdirsSafe(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    // ENOENT on a fresh workspace — locations dir doesn't exist
    // yet, treat as empty.
    return [];
  }
}

async function readSidecarsInDir(absDir: string, year: string, month: string): Promise<ListedSidecar[]> {
  const entries = await readdir(absDir).catch(() => []);
  const out: ListedSidecar[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(SIDECAR_EXT)) continue;
    const sidecarId = entry.slice(0, -SIDECAR_EXT.length);
    const absPath = path.join(absDir, entry);
    try {
      const raw = await readFile(absPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const sidecar = validateSidecarShape(parsed);
      if (!sidecar) {
        log.warn("photo-locations", "skipping sidecar with invalid shape", { path: absPath });
        continue;
      }
      out.push({
        id: sidecarId,
        relativePath: path.posix.join(WORKSPACE_DIRS.locations, year, month, entry),
        sidecar,
      });
    } catch (err) {
      log.warn("photo-locations", "skipping malformed sidecar", { path: absPath, error: String(err) });
    }
  }
  return out;
}
