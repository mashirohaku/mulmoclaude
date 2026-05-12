// Shared sanitize wrapper for `marked.parse` output.
//
// DOMPurify's defaults strip every `<iframe>`, which would also kill
// the YouTube embeds emitted by `registerYoutubeEmbed` in
// `wikiEmbedHandlers.ts`. Instead of opting individual call sites
// out of sanitisation (or worse, dropping DOMPurify), this wrapper
// keeps the strict default behaviour and **selectively** lets the
// known-safe iframe shape through:
//
//   <iframe src="https://www.youtube-nocookie.com/embed/<11-char-id>">
//
// Anything else with a different host (or path / query that doesn't
// match) is stripped by the `uponSanitizeElement` hook BEFORE
// DOMPurify decides whether to keep the tag. The `ADD_TAGS` /
// `ADD_ATTR` config only takes effect for iframes that survived the
// hook — so an attacker pasting `<iframe src="https://evil/...">`
// into a sources description still gets stripped.
//
// Centralising here so the same policy applies to skill bodies,
// source descriptions, and any future markdown surface — the host
// only configures iframes once.

import DOMPurify from "dompurify";

// Tight: no query string allowed. `registerYoutubeEmbed` always emits
// the no-params shape, so omitting the trailing `?...` group closes a
// ReDoS lint warning without losing any real-world coverage.
const ALLOWED_IFRAME_SRC = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/;

let hookInstalled = false;
function ensureHook(): void {
  if (hookInstalled) return;
  hookInstalled = true;
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const src = (node as Element).getAttribute("src") ?? "";
    if (!ALLOWED_IFRAME_SRC.test(src)) {
      // Drop the iframe entirely — preserves the surrounding
      // markdown but removes the unsafe element.
      node.parentNode?.removeChild(node);
    }
  });
}

const SANITIZE_CONFIG = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "loading", "referrerpolicy"],
};

/** Sanitize HTML produced by `marked.parse`. Strips everything
 *  DOMPurify would normally strip; additionally permits a tightly
 *  scoped iframe shape used by the YouTube wiki embed. */
export function sanitizeMarkdownHtml(html: string): string {
  ensureHook();
  // DOMPurify's typed return is `string | TrustedHTML` depending on
  // config flags; we never enable `RETURN_TRUSTED_TYPE`, so the
  // result is always a string. The double cast is the documented
  // workaround when narrowing through the union.
  return DOMPurify.sanitize(html, SANITIZE_CONFIG) as unknown as string;
}

/** Test seam — undoes the global DOMPurify hook so an isolated
 *  test can verify the no-hook baseline. Production code never
 *  calls this. */
export function _resetSanitizeForTests(): void {
  DOMPurify.removeAllHooks();
  hookInstalled = false;
}
