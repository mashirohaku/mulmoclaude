// Regression tests for the iframe-height clamp (#1268).
//
// Background: the in-iframe reporter (`iframeHeightReporterScript.ts`)
// posts `document.documentElement.scrollHeight` to the parent. For
// content that uses viewport-relative CSS (a Leaflet map with
// `body { height: 100% }` plus `#map { height: calc(100vh - 130px) }`),
// scrollHeight roughly equals the iframe's *own* height — so on every
// ResizeObserver tick the height feeds back through the parent's
// `iframe.style.height = scrollHeight` and climbs without bound.
// Pre-fix the only ceiling was 30,000px, which left enough room for
// the iframe to walk most of the way there before stabilising.
//
// `clampIframeHeight` enforces both caps (absolute MAX +
// `MAX_IFRAME_VH * viewport`) so the runaway is bounded and
// reasonable-content reports below the cap pass through unchanged.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { clampIframeHeight, MAX_IFRAME_VH, MAX_REPORTED_IFRAME_HEIGHT_PX } from "../../../src/utils/dom/iframeHeightClamp";

describe("clampIframeHeight — happy path", () => {
  it("returns the reported height when comfortably under the viewport cap", () => {
    // 800px tall viewport → cap is floor(800 * 0.85) = 680.
    // A reported 400px is unaffected.
    assert.equal(clampIframeHeight(400, 800), 400);
  });

  it("returns the reported height for a small text document (<200px)", () => {
    assert.equal(clampIframeHeight(180, 1080), 180);
  });

  it("rounds the viewport cap with floor to avoid a sub-pixel ceiling drift", () => {
    // 0.85 * 1000 = 850 exactly. A 1000px report clamps to 850.
    assert.equal(clampIframeHeight(1000, 1000), 850);
  });
});

describe("clampIframeHeight — feedback-loop runaway (the #1268 case)", () => {
  it("clamps a viewport-relative report at floor(viewport * 0.85)", () => {
    // Map content reports its own iframe height back. After enough
    // cycles it would climb toward window.innerHeight (or beyond,
    // bounded by the legacy 30K cap). Under the new clamp, it
    // saturates at 0.85 * viewport.
    const viewport = 900;
    const expected = Math.floor(viewport * MAX_IFRAME_VH);
    assert.equal(clampIframeHeight(viewport, viewport), expected);
    assert.equal(expected, 765);
  });

  it("simulates the runaway: repeated reports never exceed the cap", () => {
    const viewport = 1080;
    const cap = Math.floor(viewport * MAX_IFRAME_VH); // 918
    let last = 150; // initial scrollHeight at iframe's CSS-default height
    // Each cycle the iframe's actual rendered height becomes whatever
    // we just clamped to. Viewport-relative content's next scrollHeight
    // report is ≈ that value (with the small δ that drives the loop).
    // Loop count chosen so even slow drift (6px / cycle) reaches the
    // cap from a 150px start (needs ~128 cycles); 256 is comfortable.
    for (let cycle = 0; cycle < 256; cycle++) {
      const reported = last + 6; // 6px feedback drift per ResizeObserver tick
      last = clampIframeHeight(reported, viewport);
      assert.ok(last <= cap, `cycle ${cycle}: clamped ${last} > cap ${cap}`);
    }
    // Should have saturated at the cap exactly, not bounced higher.
    assert.equal(last, cap);
  });

  it("clamps at the absolute MAX even when the viewport is larger than 30K/0.85", () => {
    // Hypothetical absurd viewport — still bounded by the absolute MAX
    // (defence against a runaway script in a window with mis-reported
    // innerHeight, fullscreen API quirks, etc.).
    const huge = 100_000;
    const result = clampIframeHeight(huge, huge);
    assert.equal(result, MAX_REPORTED_IFRAME_HEIGHT_PX);
  });
});

describe("clampIframeHeight — invalid inputs", () => {
  it("returns 0 for non-positive reported heights (caller skips the update)", () => {
    assert.equal(clampIframeHeight(0, 800), 0);
    assert.equal(clampIframeHeight(-100, 800), 0);
  });

  it("returns 0 for non-finite reported heights", () => {
    assert.equal(clampIframeHeight(Number.NaN, 800), 0);
    assert.equal(clampIframeHeight(Number.POSITIVE_INFINITY, 800), 0);
  });

  it("falls back to absolute MAX when the viewport is unknown / non-finite", () => {
    // Defensive path: very early in mount, in tests, or under a
    // resize-during-message race we may be handed 0 or NaN. The
    // viewport cap drops out and only the absolute ceiling applies.
    assert.equal(clampIframeHeight(500, 0), 500);
    assert.equal(clampIframeHeight(500, Number.NaN), 500);
    assert.equal(clampIframeHeight(50_000, 0), MAX_REPORTED_IFRAME_HEIGHT_PX);
  });
});

describe("clampIframeHeight — boundary at the viewport cap", () => {
  it("passes a report that exactly equals the cap unchanged", () => {
    const viewport = 1000;
    const cap = Math.floor(viewport * MAX_IFRAME_VH);
    assert.equal(clampIframeHeight(cap, viewport), cap);
  });

  it("clamps a report 1px above the cap", () => {
    const viewport = 1000;
    const cap = Math.floor(viewport * MAX_IFRAME_VH);
    assert.equal(clampIframeHeight(cap + 1, viewport), cap);
  });

  it("returns floor of MAX_IFRAME_VH * viewport with at least 1px (degenerate viewport)", () => {
    // Hypothetical 1px viewport — `Math.max(1, floor(0.85))` floors to 1.
    assert.equal(clampIframeHeight(500, 1), 1);
  });
});
