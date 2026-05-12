// Tests for `sanitizeMarkdownHtml` — the shared DOMPurify wrapper
// that lets the YouTube wiki embed iframe survive while keeping
// every other iframe (foreign hosts, malformed paths, malicious src
// attempts) stripped.

import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// `dompurify` requires a DOM. Real Vue runtime gets one from the
// browser; tests run in Node, so wire JSDOM into globals BEFORE
// importing the wrapper (DOMPurify reads `window` at module load).
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as { window?: unknown; document?: unknown }).window = dom.window;
(globalThis as { window?: unknown; document?: unknown }).document = dom.window.document;

const { sanitizeMarkdownHtml, _resetSanitizeForTests } = await import("../../../src/utils/markdown/sanitize");

before(() => {
  _resetSanitizeForTests();
});

beforeEach(() => {
  _resetSanitizeForTests();
});

describe("sanitizeMarkdownHtml — YouTube allowlist", () => {
  it("preserves the canonical youtube-nocookie embed iframe", () => {
    const input =
      '<p>before <span class="wiki-embed wiki-embed-youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" allowfullscreen></iframe></span> after</p>';
    const output = sanitizeMarkdownHtml(input);
    assert.match(output, /<iframe/);
    assert.match(output, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
  });

  it("strips an iframe pointing at the cookie-tracking youtube.com host", () => {
    const input = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>';
    const output = sanitizeMarkdownHtml(input);
    assert.doesNotMatch(output, /<iframe/);
  });

  it("strips an iframe pointing at a foreign host", () => {
    const input = '<iframe src="https://evil.example.com/payload"></iframe>';
    const output = sanitizeMarkdownHtml(input);
    assert.doesNotMatch(output, /<iframe/);
    assert.doesNotMatch(output, /evil\.example\.com/);
  });

  it("strips a youtube-nocookie iframe with a non-matching id (path traversal etc.)", () => {
    const input = '<iframe src="https://www.youtube-nocookie.com/embed/../evil"></iframe>';
    const output = sanitizeMarkdownHtml(input);
    assert.doesNotMatch(output, /<iframe/);
  });

  it("strips a javascript: iframe even when wrapped in trusted-looking markup", () => {
    const input = '<span class="wiki-embed-youtube"><iframe src="javascript:alert(1)"></iframe></span>';
    const output = sanitizeMarkdownHtml(input);
    assert.doesNotMatch(output, /<iframe/);
    assert.doesNotMatch(output, /javascript:/);
  });
});

describe("sanitizeMarkdownHtml — non-iframe content unchanged", () => {
  it("preserves headings, paragraphs, and links", () => {
    const input = '<h1>Title</h1><p>Body with <a href="https://example.com">link</a>.</p>';
    const output = sanitizeMarkdownHtml(input);
    assert.match(output, /<h1>Title<\/h1>/);
    assert.match(output, /<a href="https:\/\/example\.com">link<\/a>/);
  });

  it("strips a script tag (default DOMPurify behaviour preserved)", () => {
    const input = "<p>hello</p><script>alert(1)</script>";
    const output = sanitizeMarkdownHtml(input);
    assert.doesNotMatch(output, /<script/);
    assert.match(output, /<p>hello<\/p>/);
  });

  it("preserves an `<img>` tag (used by amazon thumbnails)", () => {
    const input =
      '<a href="https://www.amazon.com/dp/B00ICN066A"><img src="https://images-na.ssl-images-amazon.com/images/P/B00ICN066A.01.L.jpg" alt="Amazon product B00ICN066A" loading="lazy" /></a>';
    const output = sanitizeMarkdownHtml(input);
    assert.match(output, /<img/);
    assert.match(output, /loading="lazy"/);
  });
});
