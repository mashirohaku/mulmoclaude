// Pure clamp for the iframe height the in-iframe reporter posts to
// the parent (`mc-iframe-height` postMessage). Lives in its own
// module so the regression case (#1268) — viewport-relative content
// that climbs without bound through the parent's
// `iframe.style.height = scrollHeight` feedback path — can be
// exercised without mounting StackView or a real iframe.
//
// See `src/utils/html/iframeHeightReporterScript.ts` for the
// in-iframe side, and `src/components/StackView.vue` for the parent's
// listener that calls into this clamp.

/** Hard ceiling against multi-million-pixel reports from a malicious
 *  or buggy embedded script. Well above any realistic single-document
 *  presentHtml content (a 4K monitor's viewport is ~2160px). */
export const MAX_REPORTED_IFRAME_HEIGHT_PX = 30_000;

/** Fraction of the host viewport the iframe is allowed to occupy.
 *  Clips viewport-relative content (a Leaflet map with
 *  `body { height: 100% }` plus `#map { height: calc(100vh - 130px) }`)
 *  before it can feed back through the parent's height-setting and
 *  climb indefinitely; also keeps the surrounding chat scrollable. */
export const MAX_IFRAME_VH = 0.85;

/** Clamp a `mc-iframe-height` report into the allowed range.
 *
 *  - `reported`: the height (px) the in-iframe reporter posted.
 *  - `viewportHeightPx`: typically `window.innerHeight` from the parent.
 *
 *  Floors the result at 1 (so an explicit height is always applied).
 *  Returns 0 for non-positive / non-finite inputs so the caller can
 *  detect "skip this update".
 */
export function clampIframeHeight(reported: number, viewportHeightPx: number): number {
  if (!Number.isFinite(reported) || reported <= 0) return 0;
  if (!Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0) {
    // Defensive: without a viewport reference (very early in mount,
    // tests, etc.) only the absolute MAX applies.
    return Math.min(reported, MAX_REPORTED_IFRAME_HEIGHT_PX);
  }
  const viewportCap = Math.max(1, Math.floor(viewportHeightPx * MAX_IFRAME_VH));
  return Math.min(reported, MAX_REPORTED_IFRAME_HEIGHT_PX, viewportCap);
}
