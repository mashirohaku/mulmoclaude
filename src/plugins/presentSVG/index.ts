import type { PluginRegistration, ToolPlugin } from "../../tools/types";
import type { ToolResult } from "gui-chat-protocol";
import toolDefinition, { TOOL_NAME, type SvgEndpoints } from "./definition";
import { pluginEndpoints } from "../api";
import { wrapWithScope } from "../scope";
import View from "./View.vue";
import Preview from "./Preview.vue";
import { apiCall } from "../../utils/api";
import { makeUuid } from "../../utils/id";

export interface PresentSvgData {
  title?: string;
  filePath: string;
}

const presentSvgPlugin: ToolPlugin<PresentSvgData> = {
  toolDefinition,

  async execute(_context, args) {
    const endpoints = pluginEndpoints<SvgEndpoints>("svg");
    const { method, url } = endpoints.create;
    const result = await apiCall<ToolResult<PresentSvgData>>(url, { method, body: args });
    if (!result.ok) {
      return {
        toolName: TOOL_NAME,
        uuid: makeUuid(),
        message: result.error,
      };
    }
    return {
      ...result.data,
      toolName: TOOL_NAME,
      uuid: makeUuid(),
    };
  },

  isEnabled: () => true,
  generatingMessage: "Presenting SVG…",
  viewComponent: wrapWithScope("svg", View),
  previewComponent: wrapWithScope("svg", Preview),
};

export default presentSvgPlugin;
export { TOOL_NAME };

export const REGISTRATION: PluginRegistration = {
  toolName: TOOL_NAME,
  entry: presentSvgPlugin,
};
