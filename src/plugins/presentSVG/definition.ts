import type { ToolDefinition } from "gui-chat-protocol";
import { META } from "./meta";
import type { ResolvedRoute } from "../meta-types";

export const TOOL_NAME = META.toolName;
export type SvgEndpoints = { readonly [K in keyof typeof META.apiRoutes]: ResolvedRoute };

const toolDefinition: ToolDefinition = {
  type: "function",
  name: META.toolName,
  description: "Save and present a vector graphic (SVG) in the canvas.",
  prompt: `Use ${TOOL_NAME} when the user wants a diagram, schematic, logo, icon, or any visual that benefits from being vector — crisp at any zoom, editable as text, small filesize. Prefer generateImage for photographic / illustrative output, presentHtml when scripted interactivity beyond SVG's native SMIL animation is required, and presentChart for data visualizations. The svg parameter must be a complete, self-contained SVG document starting with \`<svg ...>\` and ending with \`</svg>\` (the \`<?xml ?>\` declaration is optional). Include a \`viewBox\` so it scales cleanly. SMIL animation tags (\`<animate>\`, \`<animateTransform>\`) are supported; \`<script>\` inside the SVG will NOT execute (the View renders via \`<img>\` for safety) — use presentHtml if you need scripting. Saved to \`artifacts/svg/<YYYY>/<MM>/...\`.`,
  parameters: {
    type: "object",
    properties: {
      svg: {
        type: "string",
        description: "Complete, self-contained SVG document (root `<svg>` element with explicit `viewBox`).",
      },
      title: {
        type: "string",
        description: "Short label shown in the preview sidebar.",
      },
    },
    required: ["svg"],
  },
};

export default toolDefinition;
