// Edgar plugin — server side runtime plugin.
//
// One tool, six kinds, no Vue. Pure tool dispatch — results
// return to the LLM as a tool_use_result block, the LLM decides
// what to surface.
//
// Self-healing config flow: when the SEC-required contact info
// is missing the dispatch returns a structured `{instructions}`
// payload (NOT thrown). The LLM reads the prose + JSON block,
// asks the user for name + email, writes the config file via
// its built-in Write tool, and retries the original call.

import { definePlugin } from "gui-chat-protocol";

import { TOOL_DEFINITION } from "./definition";
import { Args, type EdgarArgs } from "./args";
import { missingConfigResponse, readConfig, userAgentFromConfig } from "./config";
import { createEdgarClient, type EdgarClient } from "./edgar";

export { TOOL_DEFINITION };

// Per-kind handlers. Kept tiny so the dispatcher is well under
// the 20-line cap and each kind can be tested in isolation.

async function handleLookupCik(client: EdgarClient, args: Extract<EdgarArgs, { kind: "lookup_cik" }>): Promise<unknown> {
  return await client.resolve(args.ticker);
}

async function handleRecentFilings(client: EdgarClient, args: Extract<EdgarArgs, { kind: "get_recent_filings" }>): Promise<unknown> {
  const { cik, name, ticker } = await client.resolve(args.company);
  const result = await client.getRecentFilings(cik, { formTypes: args.form_types, limit: args.limit });
  return { cik, ticker, resolvedName: name, ...result };
}

async function handleFilingDocument(client: EdgarClient, args: Extract<EdgarArgs, { kind: "get_filing_document" }>): Promise<unknown> {
  const { cik } = await client.resolve(args.company);
  const { url, text } = await client.getFilingDocument(cik, args.accession_number, args.primary_document);
  const truncated = text.length > args.max_chars ? `${text.slice(0, args.max_chars)}\n\n[... truncated ${text.length - args.max_chars} more chars ...]` : text;
  return { url, length: text.length, content: truncated };
}

async function handleCompanyFacts(client: EdgarClient, args: Extract<EdgarArgs, { kind: "get_company_facts" }>): Promise<unknown> {
  const { cik } = await client.resolve(args.company);
  return await client.getCompanyFacts(cik);
}

async function handleConcept(client: EdgarClient, args: Extract<EdgarArgs, { kind: "get_concept" }>): Promise<unknown> {
  const { cik } = await client.resolve(args.company);
  return await client.getCompanyConcept(cik, args.taxonomy, args.concept);
}

async function handleSearchFilings(client: EdgarClient, args: Extract<EdgarArgs, { kind: "search_filings" }>): Promise<unknown> {
  const dateRange = args.from_date && args.to_date ? { from: args.from_date, to: args.to_date } : undefined;
  return await client.fullTextSearch(args.query, { forms: args.forms, dateRange });
}

async function dispatch(client: EdgarClient, args: EdgarArgs): Promise<unknown> {
  switch (args.kind) {
    case "lookup_cik":
      return handleLookupCik(client, args);
    case "get_recent_filings":
      return handleRecentFilings(client, args);
    case "get_filing_document":
      return handleFilingDocument(client, args);
    case "get_company_facts":
      return handleCompanyFacts(client, args);
    case "get_concept":
      return handleConcept(client, args);
    case "search_filings":
      return handleSearchFilings(client, args);
    default: {
      const exhaustive: never = args;
      throw new Error(`unknown edgar kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export default definePlugin(({ fetch, log, files }) => {
  const client = createEdgarClient({
    fetch,
    log,
    getUserAgent: async () => {
      // The dispatch checks config first; if we reach edgarFetch
      // the config exists. Re-read here so a mid-session config
      // edit (rare) is picked up without restart.
      const cfg = await readConfig(files);
      if (!cfg) {
        // Defence in depth — should be unreachable because the
        // dispatch returns missingConfigResponse() before the
        // client runs.
        throw new Error("edgar: contact config disappeared between check and request");
      }
      return userAgentFromConfig(cfg);
    },
  });

  return {
    TOOL_DEFINITION,

    async edgar(rawArgs: unknown) {
      const cfg = await readConfig(files);
      if (!cfg) return missingConfigResponse();

      const parsed = Args.safeParse(rawArgs);
      if (!parsed.success) {
        return { instructions: `Invalid edgar arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}` };
      }

      try {
        const result = await dispatch(client, parsed.data);
        // The MCP bridge surfaces only `message` + `instructions`
        // to the LLM. Stringify the result into `message` so the
        // EDGAR data actually reaches the model.
        return { message: JSON.stringify(result) };
      } catch (err) {
        return { instructions: `EDGAR call failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
});
