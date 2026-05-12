// Single dispatch endpoint for the host UI's bell popup. Body shape:
// `{ action: "clear" | "cancel" | "list" | "listHistory", ... }`.
//
// Trust boundary — `publish` is INTENTIONALLY not an HTTP action.
// The only legitimate publishers are in-process: plugins go through
// `runtime.notifier.publish` (auto-binds `pluginPkg` to the calling
// plugin's pkg name in `server/plugins/runtime.ts:makeScopedNotifier`)
// and host-internal modules call `engine.publish` directly. Exposing
// `publish` over HTTP would let any holder of the bearer token
// publish under any plugin's namespace, since the route layer cannot
// authenticate which plugin (if any) made the request — bearer auth
// only proves "the caller is on this machine and knows the token,"
// not "the caller is plugin X." If a future feature genuinely needs
// remote publish, it must arrive with caller-identity headers and a
// per-pkg auth check; until then this surface is host-UI-only.
//
// `clear` / `cancel` are deliberately host-scoped (no `pluginPkg`):
// the bell popup belongs to the host, sees every plugin's entries,
// and must be able to dismiss any of them. Plugin-scoped clears (the
// per-plugin isolation property) live on the in-process runtime API
// only — `engine.clearForPlugin` is not reachable from this route.

import { Router, type Request, type Response } from "express";
import { API_ROUTES } from "../../../src/config/apiRoutes.js";
import { cancel, clear, listAll, listHistory } from "../../notifier/engine.js";
import type { NotifierEntry, NotifierHistoryEntry } from "../../notifier/types.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

interface DispatchBody {
  action?: unknown;
  // clear / cancel
  id?: unknown;
}

type DispatchResponse = { ok: true } | { entries: NotifierEntry[] } | { history: NotifierHistoryEntry[] } | { error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const notifierRouter: Router = Router();

// Detailed error stays in the server log for triage (via asyncHandler's
// `log.error`); the HTTP response gets the opaque "internal error"
// message so a parser-thrown filesystem path / internal stack frame
// can't leak to the client. Echoing `String(err)` would have given
// e.g. `Error: ENOENT, open '/Users/<...>/active.json'` to anyone
// holding the bearer token (CodeRabbit review on PR #1196).
notifierRouter.post(
  API_ROUTES.notifier.dispatch,
  asyncHandler<Request<object, DispatchResponse, DispatchBody>, Response<DispatchResponse>>("notifier-route", "internal error", async (req, res) => {
    const body = req.body ?? {};
    const { action } = body;
    switch (action) {
      case "clear": {
        if (!isNonEmptyString(body.id)) {
          res.status(400).json({ error: "id required" });
          return;
        }
        await clear(body.id);
        res.json({ ok: true });
        return;
      }
      case "cancel": {
        if (!isNonEmptyString(body.id)) {
          res.status(400).json({ error: "id required" });
          return;
        }
        await cancel(body.id);
        res.json({ ok: true });
        return;
      }
      case "list": {
        const entries = await listAll();
        res.json({ entries });
        return;
      }
      case "listHistory": {
        const history = await listHistory();
        res.json({ history });
        return;
      }
      // `publish` falls through to the default handler. See the
      // trust-boundary note at the top of this file — exposing it
      // over HTTP would let any bearer-token holder spoof an
      // arbitrary `pluginPkg`. Use the in-process runtime API.
      default:
        res.status(400).json({ error: `unknown action: ${typeof action === "string" ? action : "<missing>"}` });
    }
  }),
);

export default notifierRouter;
