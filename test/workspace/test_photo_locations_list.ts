// Defensive-listing tests for photo-locations (#1247-#1255 cross-
// review follow-up).
//
// Targets the regression Codex flagged: a parseable-but-malformed
// sidecar (missing capturedAt, version mismatch, …) used to crash
// the whole list endpoint at sort time. The validator + skip path
// must let one bad file pass without taking down the listing.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { listAllSidecars, countAllSidecars } from "../../server/workspace/photo-locations/list.js";
import { WORKSPACE_PATHS } from "../../server/workspace/paths.js";

type DescriptorMap = Record<string, PropertyDescriptor>;

const VALID_SIDECAR = {
  version: 1,
  photo: { relativePath: "data/attachments/2026/05/abc.jpg", mimeType: "image/jpeg" },
  exif: { lat: 35.6586, lng: 139.7454, takenAt: "2026-04-12T08:30:00.000Z" },
  capturedAt: "2026-05-09T12:00:00.000Z",
};

describe("photo-locations list — defensive sidecar validation", () => {
  let savedDescriptors: DescriptorMap = {};
  let workspaceRoot: string;

  function overrideWorkspacePath(key: string, value: string): void {
    const desc = Object.getOwnPropertyDescriptor(WORKSPACE_PATHS, key);
    if (desc) savedDescriptors[key] = desc;
    Object.defineProperty(WORKSPACE_PATHS, key, { ...(desc ?? { configurable: true }), value, configurable: true, enumerable: true, writable: true });
  }

  beforeEach(() => {
    savedDescriptors = {};
    workspaceRoot = mkdtempSync(path.join(tmpdir(), "photo-list-test-"));
    overrideWorkspacePath("locations", path.join(workspaceRoot, "data/locations"));
    mkdirSync(path.join(workspaceRoot, "data/locations/2026/05"), { recursive: true });
  });

  afterEach(() => {
    for (const [key, desc] of Object.entries(savedDescriptors)) {
      Object.defineProperty(WORKSPACE_PATHS, key, desc);
    }
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function writeSidecar(name: string, content: unknown): void {
    const dir = path.join(workspaceRoot, "data/locations/2026/05");
    const body = typeof content === "string" ? content : JSON.stringify(content);
    writeFileSync(path.join(dir, name), body);
  }

  it("returns valid sidecars and skips a totally-malformed JSON neighbour", async () => {
    writeSidecar("good.json", VALID_SIDECAR);
    writeSidecar("bad.json", "{not json");
    const all = await listAllSidecars();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, "good");
  });

  it("skips a sidecar missing capturedAt — does NOT throw at sort time", async () => {
    writeSidecar("good.json", VALID_SIDECAR);
    const noCapturedAt = { ...VALID_SIDECAR, capturedAt: undefined };
    delete (noCapturedAt as Record<string, unknown>).capturedAt;
    writeSidecar("missing-time.json", noCapturedAt);
    const all = await listAllSidecars();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, "good");
  });

  it("skips a sidecar with non-string capturedAt", async () => {
    writeSidecar("good.json", VALID_SIDECAR);
    writeSidecar("nan.json", { ...VALID_SIDECAR, capturedAt: 12345 });
    const all = await listAllSidecars();
    assert.equal(all.length, 1);
  });

  it("skips a sidecar with the wrong version", async () => {
    writeSidecar("future.json", { ...VALID_SIDECAR, version: 99 });
    writeSidecar("good.json", VALID_SIDECAR);
    const all = await listAllSidecars();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, "good");
  });

  it("skips a sidecar with malformed photo block", async () => {
    writeSidecar("nophoto.json", { ...VALID_SIDECAR, photo: null });
    writeSidecar("badpath.json", { ...VALID_SIDECAR, photo: { mimeType: "image/jpeg" } }); // missing relativePath
    writeSidecar("good.json", VALID_SIDECAR);
    const all = await listAllSidecars();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, "good");
  });

  it("returns an empty array when EVERY sidecar is malformed (no crash)", async () => {
    writeSidecar("a.json", "{invalid");
    writeSidecar("b.json", { wrong: "shape" });
    writeSidecar("c.json", { ...VALID_SIDECAR, version: 99 });
    const all = await listAllSidecars();
    assert.deepEqual(all, []);
  });

  it("count agrees with list — malformed sidecars are excluded from both", async () => {
    // count now reuses the same parse-+-validate path as list so
    // the status badge can never disagree with the row list.
    // (Codex review on PR #1263.)
    writeSidecar("a.json", VALID_SIDECAR);
    writeSidecar("b.json", "{garbage");
    writeSidecar("c.json", { ...VALID_SIDECAR, version: 99 });
    const total = await countAllSidecars();
    const all = await listAllSidecars();
    assert.equal(total, 1);
    assert.equal(total, all.length);
  });
});
