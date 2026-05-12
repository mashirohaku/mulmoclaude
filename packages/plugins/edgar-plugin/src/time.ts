// Local time-constants. The plugin can't import host's
// `server/utils/time.ts` (the runtime is sandboxed), so we mirror
// the small constants we need. Keeping them in one module
// preserves the "no raw 1000 / 60000" lint convention plugin-side
// too. Mirrors `packages/plugins/spotify-plugin/src/time.ts`.

export const ONE_SECOND_MS = 1000;

// SEC EDGAR throttle: 9 req/sec stays a safe margin under the
// 10 req/sec cap. ~111ms gap between releases.
export const MIN_INTERVAL_MS = ONE_SECOND_MS / 9;

// Per-request fetch timeout. SEC's `data.sec.gov` and
// `efts.sec.gov` answer in well under 5s in normal weather; 15s
// covers transient slowness without hanging the chat indefinitely.
export const FETCH_TIMEOUT_MS = 15 * ONE_SECOND_MS;
