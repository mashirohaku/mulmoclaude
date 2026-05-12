import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatDateTime, formatTime, formatShortTime, formatShortDate, formatMonthYear } from "../../../src/utils/format/date.js";

describe("formatDate", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const out = formatDate("2026-04-10T07:21:39.125Z");
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0);
  });

  it("contains digits (some form of time/day)", () => {
    const out = formatDate("2026-04-10T07:21:39.125Z");
    assert.match(out, /\d/);
  });

  it("does not throw for an unparseable input", () => {
    // Locale-aware formatting of an invalid Date never throws — it
    // returns a placeholder string ("Invalid Date" / "Invalid Date
    // Invalid Date" depending on locale). We only assert the safety
    // contract: the function must not bubble an exception up to the
    // UI render path.
    assert.doesNotThrow(() => formatDate("not a date"));
    // And it returns a non-empty placeholder string of some kind.
    const out = formatDate("not a date");
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0);
    assert.match(out, /Invalid Date/);
  });

  it("differs across days at the same time", () => {
    const dateJan = formatDate("2026-01-01T12:00:00Z");
    const dateDec = formatDate("2026-12-31T12:00:00Z");
    assert.notEqual(dateJan, dateDec);
  });
});

describe("formatDateTime", () => {
  it("returns a non-empty string from epoch ms", () => {
    const out = formatDateTime(Date.now());
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0);
    assert.match(out, /\d/);
  });
});

describe("formatTime", () => {
  it("returns a non-empty string from epoch ms", () => {
    const out = formatTime(Date.now());
    assert.equal(typeof out, "string");
    assert.match(out, /\d/);
  });
});

describe("formatShortTime", () => {
  it("returns a short time from ISO string", () => {
    const out = formatShortTime("2026-04-10T07:21:39.125Z");
    assert.equal(typeof out, "string");
    assert.match(out, /\d/);
  });

  it("falls back to raw string on parse error", () => {
    const out = formatShortTime("not a date");
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0);
  });
});

describe("formatShortDate", () => {
  it("returns a short date from epoch ms", () => {
    const out = formatShortDate(Date.now());
    assert.equal(typeof out, "string");
    assert.match(out, /\d/);
  });
});

describe("formatMonthYear", () => {
  // Fixed instant — using `Date.now()` would make the suite
  // non-deterministic (Sourcery #1316). The exact picked instant
  // doesn't matter, only that all three input shapes below address
  // the same moment so the equivalence assertion is meaningful.
  const FIXED_INSTANT = new Date(Date.UTC(2026, 3, 10, 12, 0, 0));
  const FIXED_EPOCH = FIXED_INSTANT.getTime();
  const FIXED_ISO = FIXED_INSTANT.toISOString();

  it("returns a non-empty string from a Date", () => {
    const out = formatMonthYear(FIXED_INSTANT);
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0);
  });

  it("returns the same string for equivalent Date / epoch ms / ISO inputs", () => {
    // Locale-agnostic structural invariant (Codex #1316): assert
    // that the three input shapes produce identical output for the
    // same instant, not that the output matches a literal year /
    // digit sequence (which would break in non-ASCII-digit or
    // non-Gregorian locales).
    const fromDate = formatMonthYear(FIXED_INSTANT);
    const fromEpoch = formatMonthYear(FIXED_EPOCH);
    const fromIso = formatMonthYear(FIXED_ISO);
    assert.equal(fromEpoch, fromDate);
    assert.equal(fromIso, fromDate);
    assert.ok(fromDate.length > 0);
  });
});
