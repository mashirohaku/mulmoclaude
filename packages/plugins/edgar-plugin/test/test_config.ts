// Pin the self-healing missing-config payload shape. The MCP
// bridge surfaces `instructions` to the LLM verbatim; the LLM
// uses the absolute path embedded in `instructions` to write
// the config file via its built-in Write tool. A regression
// that drops the path or splits the payload across `data`
// (which would trigger an unwanted frontend canvas push) breaks
// the self-healing flow silently.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";

import { configAbsolutePath, missingConfigResponse, PKG_NAME } from "../src/config";

describe("edgar config — missingConfigResponse", () => {
  it("returns only `instructions` (no `data` field that would push to canvas)", () => {
    const payload = missingConfigResponse() as Record<string, unknown>;
    assert.equal(typeof payload.instructions, "string");
    assert.equal(payload.data, undefined);
  });

  it("instructions text includes the absolute config path AND the JSON schema", () => {
    const { instructions } = missingConfigResponse();
    assert.ok(instructions.includes(configAbsolutePath()), `instructions must quote the absolute path; got: ${instructions}`);
    assert.match(instructions, /"name"/);
    assert.match(instructions, /"email"/);
  });

  it("instructions text includes a hard ask-the-user constraint", () => {
    const { instructions } = missingConfigResponse();
    assert.match(instructions, /ask the user/i);
    assert.match(instructions, /never invent/i);
  });
});

describe("edgar config — configAbsolutePath", () => {
  it("resolves under the workspace's runtime-plugin scope root (POSIX-normalised)", () => {
    // Forward slashes throughout, even on Windows. Mirrors the
    // production normalisation in src/config.ts so the path that
    // ends up in `missingConfigResponse().instructions` is a
    // clean string the LLM can hand to its Write tool without
    // backslash-doubling JSON noise.
    const home = homedir().replace(/\\/g, "/");
    const expected = `${home}/mulmoclaude/config/plugins/${encodeURIComponent(PKG_NAME)}/config.json`;
    assert.equal(configAbsolutePath(), expected);
  });
});
