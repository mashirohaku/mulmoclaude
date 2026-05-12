import type { PluginRegistration, ToolPlugin } from "../../tools/types";
import type { ToolResult } from "gui-chat-protocol";
import View from "./View.vue";
import toolDefinition from "./definition";
import { META } from "./meta";
import { wrapWithScope } from "../scope";
import { apiCall } from "../../utils/api";
import { makeUuid } from "../../utils/id";

// Same one-line pass-through pattern as accounting / scheduler:
// production tool calls flow Claude → MCP → REST, never through
// `execute()`. The body satisfies the gui-chat-protocol shape and
// supports any host that does call it.
export type PhotoLocationsActionData = Record<string, unknown>;

const photoLocationsPlugin: ToolPlugin<PhotoLocationsActionData> = {
  toolDefinition,

  async execute(_context, args) {
    const { method, path } = META.apiRoutes.dispatch;
    const result = await apiCall<ToolResult<PhotoLocationsActionData>>(`/api/${META.apiNamespace}${path}`, { method, body: args });
    if (!result.ok) {
      return { toolName: toolDefinition.name, uuid: makeUuid(), message: result.error };
    }
    return { ...result.data, toolName: toolDefinition.name, uuid: result.data.uuid ?? makeUuid() };
  },

  isEnabled: () => true,
  generatingMessage: "Reading photo locations…",
  viewComponent: wrapWithScope("photoLocations", View),
};

export default photoLocationsPlugin;

export const REGISTRATION: PluginRegistration = {
  toolName: META.toolName,
  entry: photoLocationsPlugin,
};
