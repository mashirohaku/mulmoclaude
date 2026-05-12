// Pin the plugin's Zod input guards. Each regex below is a
// security boundary — `accession_number`, `primary_document`,
// and `concept` are interpolated into URL path segments on
// `sec.gov`. A regression that loosens any of these regexes
// re-opens the path-injection class flagged in PR #1270.
//
// Also pins the search_filings both-or-neither date refinement;
// the older code silently dropped one-sided bounds and ran an
// unbounded search.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Args } from "../src/args";

describe("edgar Args schema — accession_number guard", () => {
  it("accepts canonical 18-digit dashed form", () => {
    const result = Args.safeParse({
      kind: "get_filing_document",
      company: "AAPL",
      accession_number: "0000320193-24-000123",
      primary_document: "aapl-20240928.htm",
    });
    assert.equal(result.success, true);
  });

  for (const bad of [
    "../etc/passwd",
    "0000320193/24/000123",
    "0000320193-24-000123?x=1",
    "0000320193-24-000123#frag",
    "0000320193-24-00012",
    "0000320193-24-0001234",
    "abcdefghij-24-000123",
  ]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      const result = Args.safeParse({
        kind: "get_filing_document",
        company: "AAPL",
        accession_number: bad,
        primary_document: "aapl-20240928.htm",
      });
      assert.equal(result.success, false);
    });
  }
});

describe("edgar Args schema — primary_document guard", () => {
  for (const good of ["aapl-20240928.htm", "msft-2024.html", "report.xml", "filing_v2.txt", "f-1.pdf"]) {
    it(`accepts ${JSON.stringify(good)}`, () => {
      const result = Args.safeParse({
        kind: "get_filing_document",
        company: "AAPL",
        accession_number: "0000320193-24-000123",
        primary_document: good,
      });
      assert.equal(result.success, true);
    });
  }

  for (const bad of ["../etc/passwd", "../../secret.htm", "foo/bar.htm", "foo\\bar.htm", "foo.htm?x=1", "foo.htm#x", "..htm", ".hidden", "-foo.htm", ""]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      const result = Args.safeParse({
        kind: "get_filing_document",
        company: "AAPL",
        accession_number: "0000320193-24-000123",
        primary_document: bad,
      });
      assert.equal(result.success, false);
    });
  }
});

describe("edgar Args schema — concept guard", () => {
  for (const good of ["Revenues", "NetIncomeLoss", "EarningsPerShareBasic", "CashAndCashEquivalentsAtCarryingValue", "Snake_Case_Concept"]) {
    it(`accepts ${JSON.stringify(good)}`, () => {
      const result = Args.safeParse({ kind: "get_concept", company: "AAPL", concept: good });
      assert.equal(result.success, true);
    });
  }

  for (const bad of ["../etc/passwd", "Net/Income", "Net.Income", "Net Income", "Net?Income", "1Revenues", ""]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      const result = Args.safeParse({ kind: "get_concept", company: "AAPL", concept: bad });
      assert.equal(result.success, false);
    });
  }
});

describe("edgar Args schema — search_filings date pairing", () => {
  it("accepts both omitted", () => {
    const result = Args.safeParse({ kind: "search_filings", query: "material weakness" });
    assert.equal(result.success, true);
  });

  it("accepts both provided", () => {
    const result = Args.safeParse({
      kind: "search_filings",
      query: "material weakness",
      from_date: "2024-01-01",
      to_date: "2024-12-31",
    });
    assert.equal(result.success, true);
  });

  it("rejects from_date alone", () => {
    const result = Args.safeParse({
      kind: "search_filings",
      query: "material weakness",
      from_date: "2024-01-01",
    });
    assert.equal(result.success, false);
  });

  it("rejects to_date alone", () => {
    const result = Args.safeParse({
      kind: "search_filings",
      query: "material weakness",
      to_date: "2024-12-31",
    });
    assert.equal(result.success, false);
  });
});
