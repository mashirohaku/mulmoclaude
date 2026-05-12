// Config: SEC EDGAR's User-Agent rule requires an identifying
// contact name + email. The LLM is responsible for asking the
// user for these values and writing the file via its built-in
// Write tool — the missing-config response below tells it the
// absolute path and the JSON shape.
//
// We compute the absolute path here purely so the missing-config
// response can quote the literal path Claude needs to write to.
// `runtime.files.config` resolves to
//   <workspace>/config/plugins/<encodeURIComponent(pkgName)>/
// and `<workspace>` is hard-coded as `~/mulmoclaude/` by
// `server/workspace/paths.ts` in the host.

import { homedir } from "node:os";
import { z } from "zod";
import type { PluginRuntime } from "gui-chat-protocol";

export const PKG_NAME = "@mulmoclaude/edgar-plugin";

const CONFIG_FILE = "config.json";

const ConfigSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
});

export type EdgarConfig = z.infer<typeof ConfigSchema>;

/** Absolute path the plugin reads from / Claude must write to.
 *  Forward slashes throughout — even on Windows, where `homedir()`
 *  returns `C:\Users\...` with backslashes. Mixed separators look
 *  ugly when JSON-stringified into the missing-config payload
 *  (every `\` doubles to `\\`), and POSIX-only paths are valid on
 *  Windows for fs operations. The plugin's eslint preset bans
 *  `node:path`, so we normalise by hand. */
export function configAbsolutePath(): string {
  const seg = encodeURIComponent(PKG_NAME);
  const home = homedir().replace(/\\/g, "/");
  return `${home}/mulmoclaude/config/plugins/${seg}/${CONFIG_FILE}`;
}

/** Best-effort read. Any failure (missing file, malformed JSON,
 *  schema mismatch) collapses to `null` so the dispatch returns
 *  the self-healing instructions instead of throwing. */
export async function readConfig(files: PluginRuntime["files"]): Promise<EdgarConfig | null> {
  try {
    if (!(await files.config.exists(CONFIG_FILE))) return null;
    const raw = await files.config.read(CONFIG_FILE);
    const parsed = ConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Self-healing payload returned when config is missing. The MCP
 *  bridge surfaces only `message` + `instructions` to the LLM,
 *  so we fold the structured details (path, schema) into
 *  `instructions` as a JSON-tagged block — the LLM both reads
 *  the prose AND can parse the path/schema values out without us
 *  setting `data` (which would trigger an unwanted frontend
 *  canvas push for a server-only plugin). */
export function missingConfigResponse(): { instructions: string } {
  const path = configAbsolutePath();
  const schema = { name: "<user's full name>", email: "<user's email address>" };
  const prose =
    "The SEC EDGAR API requires an identifying contact on every request. " +
    "Please ask the user for their full name and email address, then write a JSON file at the absolute path below with the exact schema below, then retry the original tool call. " +
    "Do not proceed without asking the user — never invent a name or email.";
  return {
    instructions: `${prose}\n\nDetails (JSON):\n${JSON.stringify({ path, schema }, null, 2)}`,
  };
}

/** Build the User-Agent header value SEC requires on every request. */
export function userAgentFromConfig(cfg: EdgarConfig): string {
  return `${cfg.name} ${cfg.email}`;
}
