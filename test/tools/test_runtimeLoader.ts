// Pin the role-editor visibility contract for runtime plugins:
// every plugin returned by `/api/plugins/runtime/list` MUST surface
// in `getRuntimeToolNames()` regardless of whether the package
// ships a `dist/vue.js` bundle. Server-only plugins (no canvas
// surface — edgar is the reference case) used to disappear from
// the role-editor picker because the loader bailed out the moment
// the dynamic import failed; that's fixed by registering a
// listing-derived fallback before attempting the import.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { _resetRuntimeRegistryForTest, getRuntimePluginEntry, getRuntimeToolNames, loadOne } from "../../src/tools/runtimeLoader";

// Capture console.warn so we can assert which import-failure
// paths log diagnostics and which deliberately stay silent. The
// 404 path (server-only plugin) MUST NOT warn (every page boot
// would otherwise log noise for every server-only plugin); a
// 200-but-broken-bundle MUST warn (real bug, masked otherwise).
let originalWarn: typeof console.warn;
let warnings: string[];

beforeEach(() => {
  _resetRuntimeRegistryForTest();
  warnings = [];
  originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(" "));
  };
});

afterEach(() => {
  _resetRuntimeRegistryForTest();
  console.warn = originalWarn;
});

// Stub `globalThis.fetch` to control the HEAD probe response per
// test, since loadOne consults the asset URL with a HEAD request
// before deciding whether to dynamic-import.
function stubFetch(impl: typeof globalThis.fetch): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = original;
  };
}

describe("runtimeLoader.loadOne — fallback registration", () => {
  it("registers a fallback entry SYNCHRONOUSLY before the import resolves", async () => {
    // The body up to the first `await` runs synchronously, so the
    // registry must contain the fallback the moment loadOne is
    // called — even if the import never resolves. We stub fetch
    // to a 404 so the post-await branch settles cleanly (without
    // a stub the unawaited HEAD probe would leak network work
    // past the assertions; bot-flagged on PR #1273).
    const restore = stubFetch(async () => new Response(null, { status: 404 }));
    try {
      const promise = loadOne({
        name: "@fixture/server-only",
        version: "1.0.0",
        toolName: "myFakeTool",
        description: "fixture description",
        assetBase: "http://example.invalid/sync-test",
      });
      // Read the registry BEFORE awaiting — this is the property
      // under test: the fallback is registered before any await
      // hands control back to the event loop.
      const entry = getRuntimePluginEntry("myFakeTool");
      assert.ok(entry, "fallback entry should be registered before any await");
      assert.equal(entry?.toolDefinition.name, "myFakeTool");
      assert.equal(entry?.toolDefinition.description, "fixture description");
      assert.equal(entry?.viewComponent, undefined, "no Vue View on the fallback");
      assert.equal(entry?.previewComponent, undefined, "no Vue Preview on the fallback");
      await promise;
    } finally {
      restore();
    }
  });

  it("404 HEAD response — silent fallback (server-only plugin path)", async () => {
    // The expected, normal shape for any server-only plugin
    // (edgar etc.). Must NOT warn — would log noise on every
    // page boot for every such plugin.
    const restore = stubFetch(async () => new Response(null, { status: 404 }));
    try {
      await loadOne({
        name: "@fixture/server-only",
        version: "1.0.0",
        toolName: "edgarLike",
        description: "server-only plugin",
        assetBase: "http://example.invalid/server-only",
      });
    } finally {
      restore();
    }
    const entry = getRuntimePluginEntry("edgarLike");
    assert.ok(entry, "registry entry must persist after 404 HEAD");
    assert.equal(entry?.toolDefinition.description, "server-only plugin");
    assert.equal(warnings.length, 0, `404 path must be silent; got warnings: ${JSON.stringify(warnings)}`);
  });

  it("HEAD probe network failure — warns AND keeps fallback", async () => {
    // Network failure on the probe (DNS issue, server down) is
    // unexpected and worth surfacing. Fallback still registered
    // so the tool name remains visible.
    const restore = stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    try {
      await loadOne({
        name: "@fixture/network-fail",
        version: "1.0.0",
        toolName: "netFailTool",
        description: "network failure",
        assetBase: "http://example.invalid/down",
      });
    } finally {
      restore();
    }
    assert.ok(getRuntimePluginEntry("netFailTool"), "fallback must remain on network failure");
    assert.ok(
      warnings.some((line) => line.includes("HEAD probe failed") && line.includes("@fixture/network-fail")),
      `expected HEAD probe warning; got: ${JSON.stringify(warnings)}`,
    );
  });

  it("HEAD 200 but dynamic import fails — warns (real bug, mustn't be silent)", async () => {
    // Asset endpoint says the file exists, but the import
    // explodes (parse error, broken bundle, etc.). This is a
    // genuine bug and MUST surface in the console; without the
    // probe-based split, the original silent-catch swallowed
    // these and bot review #1273 flagged it.
    const restore = stubFetch(async () => new Response("// stub", { status: 200 }));
    try {
      await loadOne({
        // assetBase that resolves to no real module — so
        // `import("...")` throws after the HEAD says 200.
        name: "@fixture/broken-bundle",
        version: "1.0.0",
        toolName: "brokenTool",
        description: "broken bundle",
        assetBase: "http://example.invalid/broken",
      });
    } finally {
      restore();
    }
    assert.ok(getRuntimePluginEntry("brokenTool"), "fallback must remain on import failure");
    assert.ok(
      warnings.some((line) => line.includes("dynamic import failed") && line.includes("@fixture/broken-bundle")),
      `expected dynamic-import warning; got: ${JSON.stringify(warnings)}`,
    );
  });

  it("multiple server-only plugins all surface in getRuntimeToolNames", async () => {
    // Replays the production case where several runtime plugins
    // are loaded in parallel — each fallback must end up in the
    // registry even though every probe 404s.
    const restore = stubFetch(async () => new Response(null, { status: 404 }));
    try {
      await Promise.all([
        loadOne({ name: "@x/a", version: "1.0.0", toolName: "toolA", description: "A", assetBase: "http://example.invalid/a" }),
        loadOne({ name: "@x/b", version: "1.0.0", toolName: "toolB", description: "B", assetBase: "http://example.invalid/b" }),
        loadOne({ name: "@x/c", version: "1.0.0", toolName: "toolC", description: "C", assetBase: "http://example.invalid/c" }),
      ]);
    } finally {
      restore();
    }
    const names = getRuntimeToolNames();
    for (const expected of ["toolA", "toolB", "toolC"]) {
      assert.ok(names.includes(expected), `${expected} missing from registry: ${JSON.stringify(names)}`);
    }
    assert.equal(warnings.length, 0, "all-404 batch must be silent");
  });
});
