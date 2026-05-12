// Central-registry metadata for the photo-locations plugin
// (#1222 PR-B). Owns one tool — `managePhotoLocations` — exposing
// the sidecars produced by the post-save EXIF hook (PR-A) so the
// LLM can answer "where were my photos taken" / "show last week's
// shots on a map" without poking at `data/locations/` directly.
//
// `mapControl` (`@gui-chat-plugin/google-map`) is the natural
// downstream consumer: a sidecar's `lat` / `lng` flow into
// `mapControl({ action: "addMarker", lat, lng })` without reshape.
//
// Browser-safe: no Vue imports, no server-only imports.

import { definePluginMeta } from "../meta-types";

export const META = definePluginMeta({
  toolName: "managePhotoLocations",
  apiNamespace: "photoLocations",
  apiRoutes: {
    /** POST /api/photoLocations — single dispatch with action
     *  discriminator. Mirrors the accounting / scheduler
     *  convention so the MCP bridge plugs in unchanged. */
    dispatch: { method: "POST", path: "" },
  },
  mcpDispatch: "dispatch",
  // Sidecar storage already lives at the host-level
  // `WORKSPACE_DIRS.locations` (declared by the host because the
  // hook runs server-side on every saved attachment). No new
  // directories belong to this plugin — it's a read surface over
  // host data. This META therefore omits `workspaceDirs`.
  staticChannels: {
    /** Published whenever a sidecar is added / removed so an open
     *  View refreshes without polling. */
    locationsChanged: "photoLocations:locations-changed",
  },
});
