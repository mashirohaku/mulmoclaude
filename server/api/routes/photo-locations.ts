// REST endpoint for the photo-locations plugin (#1222 PR-B).
//
// Single POST dispatch — same convention as accounting / scheduler.
// LLM tool calls flow Claude → MCP → here; the View also POSTs
// here directly for refreshes triggered by the
// `photoLocations:locations-changed` pubsub event.
//
// Two kinds for v1: `list` (every sidecar, newest-first) and
// `count` (scalar). `extractExif` and `rescan` ride a follow-up.

import { Router, Request, Response } from "express";

import { API_ROUTES } from "../../../src/config/apiRoutes.js";
import { PHOTO_LOCATIONS_KINDS } from "../../../src/plugins/photoLocations/definition.js";
import { bindRoute } from "../../utils/router.js";
import { listAllSidecars, countAllSidecars, type ListedSidecar } from "../../workspace/photo-locations/list.js";
import { log } from "../../system/logger/index.js";

const router = Router();

interface DispatchBody {
  kind?: unknown;
}

interface DispatchToolResult {
  kind: "photo-locations";
  message: string;
  data: { locations: ListedSidecar[]; total: number } | { total: number };
}

interface ErrorResponse {
  error: string;
}

async function handleList(): Promise<DispatchToolResult> {
  const locations = await listAllSidecars();
  return {
    kind: "photo-locations",
    message: `${locations.length} captured photo location${locations.length === 1 ? "" : "s"}`,
    data: { locations, total: locations.length },
  };
}

async function handleCount(): Promise<DispatchToolResult> {
  const total = await countAllSidecars();
  return {
    kind: "photo-locations",
    message: `${total} captured photo location${total === 1 ? "" : "s"}`,
    data: { total },
  };
}

bindRoute(
  router,
  API_ROUTES.photoLocations.dispatch,
  async (req: Request<object, unknown, DispatchBody>, res: Response<DispatchToolResult | ErrorResponse>) => {
    const { kind } = req.body ?? {};
    if (typeof kind !== "string") {
      res.status(400).json({ error: "request body must include a string `kind` field" });
      return;
    }
    try {
      if (kind === PHOTO_LOCATIONS_KINDS.list) {
        res.json(await handleList());
        return;
      }
      if (kind === PHOTO_LOCATIONS_KINDS.count) {
        res.json(await handleCount());
        return;
      }
      res.status(400).json({ error: `unknown kind: ${kind}` });
    } catch (err) {
      log.error("photo-locations-route", "dispatch failed", { kind, error: String(err) });
      res.status(500).json({ error: "internal error" });
    }
  },
);

export default router;
