// Generic wrapper that turns "unhandled error inside an async route
// handler" into "logged 500 response". Without it, an uncaught throw
// either crashes the request silently or surfaces as a generic 500
// with no server-side trace (#779 / DRY audit batch B).
//
// Migration story: `server/api/routes/plugins.ts` shipped a private
// `wrapPluginExecute` with this exact shape, hard-coded to the
// "plugins" log namespace. This module generalises the same idea so
// every route file uses one wrapper.
//
// Scope:
//
//   - Catches anything the inner handler throws. The wrapper logs
//     the raw error message on the server side (full detail kept for
//     debugging) and returns a 500 carrying ONLY the caller-supplied
//     `fallbackMessage` — never the raw `err.message`. Leaking
//     internal error text to clients would surface stack-shape
//     details, file paths, and library internals to anyone hitting
//     the endpoint.
//   - The inner handler stays in charge of 4xx mapping (validation,
//     not-found, etc.) — those paths respond + `return` inside the
//     handler before the wrapper's catch ever runs.
//   - Skipped when the response has already been sent (`headersSent`)
//     so a partial response that throws mid-stream doesn't try to
//     write a second status.
//
// Naming: `namespace` is the log tag (e.g. "accounting", "wiki") —
// matches the existing `log.info("namespace", …)` convention across
// the route layer. `fallbackMessage` mirrors the strings the
// hand-rolled try/catch blocks used before the migration ("failed to
// load news items", "Failed to list tasks", …) so the client-facing
// behaviour is unchanged.

import type { Request, Response } from "express";
import { log } from "../system/logger/index.js";
import { errorMessage } from "./errors.js";
import { serverError } from "./httpError.js";

// The TReq / TRes generics intentionally have NO upper-bound constraint.
//
// Express's `Request<P, ResBody, ReqBody, Query>` interface uses these
// type parameters in mixed variance positions (ResBody is
// contravariant via `res.json(body: ResBody)`, P is constrained to
// `ParamsDictionary` in the default form). Adding any `extends
// Request<…>` upper bound here would reject perfectly valid call sites
// like `Request<object, unknown, MyBody>` or `Request<SessionIdParams,
// ResBody, ReqBody>` because of invariance — TS treats `object` /
// concrete-ResBody as incompatible with the default's `ParamsDictionary`
// / `any` slots.
//
// The wrapper doesn't dereference req / res itself, so dropping the
// upper bound costs nothing — call sites still get full Express types
// via the explicit type arguments. Mirrors `wrapPluginExecute` in
// `server/api/routes/plugins.ts`, which this module generalises.
export function asyncHandler<TReq = Request, TRes = Response>(
  namespace: string,
  fallbackMessage: string,
  handler: (req: TReq, res: TRes) => Promise<void>,
): (req: TReq, res: TRes) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      // `req` / `res` are typed loosely here so the wrapper can stay
      // open to any concrete Express Request / Response shape; we
      // narrow back to the runtime contract just for the catch path.
      const expressReq = req as Request;
      const expressRes = res as Response;
      log.error(namespace, "handler threw", { route: expressReq.path, error: errorMessage(err) });
      if (!expressRes.headersSent) {
        serverError(expressRes, fallbackMessage);
      }
    }
  };
}
