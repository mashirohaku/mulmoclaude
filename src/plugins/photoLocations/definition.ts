// MCP tool definition for `managePhotoLocations` (#1222 PR-B).
//
// Two kinds for v1:
//   - `list`  — every sidecar, newest first.
//   - `count` — quick scalar for the View's badge.
//
// `extractExif` (on-demand re-read for one photo) and `rescan`
// (backfill sidecars for old uploads) ride a follow-up PR.

import type { ToolDefinition } from "gui-chat-protocol";
import { META } from "./meta";

export const TOOL_NAME = META.toolName;

export const PHOTO_LOCATIONS_KINDS = {
  list: "list",
  count: "count",
} as const;
export type PhotoLocationsKind = (typeof PHOTO_LOCATIONS_KINDS)[keyof typeof PHOTO_LOCATIONS_KINDS];

export interface PhotoLocationsArgs {
  kind: PhotoLocationsKind;
}

/** Single tool, kind-discriminated. Same shape as
 *  manageAccounting / manageScheduler so the MCP bridge plugs in
 *  unchanged. */
const TOOL_DEFINITION: ToolDefinition = {
  type: "function",
  name: TOOL_NAME,
  description:
    "Read the photo-location sidecars produced by the EXIF auto-capture hook. " +
    "Use `list` to fetch every captured location (lat/lng/altitude/takenAt/camera) " +
    "for queries like 'show last week's photos on a map' — the lat/lng pair is " +
    'shape-compatible with `mapControl({action: "addMarker"})` so you can hand ' +
    "the result straight to the Google Map plugin without reshape. " +
    "Use `count` for a quick scalar.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: Object.values(PHOTO_LOCATIONS_KINDS) },
    },
    required: ["kind"],
  },
};

export default TOOL_DEFINITION;
