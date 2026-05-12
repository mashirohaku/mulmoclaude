import { definePluginMeta } from "../meta-types";

export const META = definePluginMeta({
  toolName: "presentSVG",
  apiNamespace: "svg",
  apiRoutes: {
    /** POST /api/svg — save and present an SVG drawing. */
    create: { method: "POST", path: "" },
    /** PUT /api/svg/update — overwrite an existing SVG drawing.
     *  Body carries the workspace-relative path. */
    update: { method: "PUT", path: "/update" },
  },
  mcpDispatch: "create",
});
