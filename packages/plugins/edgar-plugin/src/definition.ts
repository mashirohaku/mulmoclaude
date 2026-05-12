// Tool schema for the single `edgar` tool. The LLM picks one of
// six `kind`s; the dispatch in `index.ts` validates with Zod and
// routes to the matching client method.
//
// `name: "edgar" as const` narrows the literal so `definePlugin`'s
// `PluginFactoryResult<N>` requires a handler exported under exactly
// this key.

export const TOOL_DEFINITION = {
  type: "function" as const,
  name: "edgar" as const,
  prompt:
    "Configuration: the SEC EDGAR API requires an identifying contact name + email on every request (their User-Agent rule). " +
    "The plugin reads these from `~/mulmoclaude/config/plugins/%40mulmoclaude%2Fedgar-plugin/config.json` with the shape " +
    '`{"name": "<full name>", "email": "<email address>"}`. ' +
    "If that file is missing on the first call, the tool returns an `instructions` payload that quotes the absolute path and JSON schema inline; " +
    "ask the user for their full name and email address, write the JSON file at that path using the Write tool, then retry the original tool call. " +
    "Never invent a name or email — always ask the user.",
  description:
    "Query the SEC EDGAR public API (U.S. company filings, XBRL facts, full-text search). " +
    "All operations are routed through the `kind` discriminator. Supported kinds:\n" +
    " - `lookup_cik`: resolve a stock ticker to a 10-digit SEC CIK + company name.\n" +
    " - `get_recent_filings`: list a company's most recent filings (filter by `form_types` like '10-K', '10-Q', '8-K', '4', 'S-1', 'DEF 14A').\n" +
    " - `get_filing_document`: fetch the primary document of a specific filing as raw HTML/text. Pair with `get_recent_filings` to discover the accession number + primary document filename.\n" +
    " - `get_company_facts`: every XBRL-tagged financial fact ever reported by a company. Output is large — prefer `get_concept` if you only need one metric.\n" +
    " - `get_concept`: time series for one XBRL concept (Revenues, Assets, NetIncomeLoss, EarningsPerShareBasic, …) across all filings.\n" +
    " - `search_filings`: full-text search across the entire EDGAR corpus.",
  parameters: {
    type: "object" as const,
    properties: {
      kind: {
        type: "string",
        enum: ["lookup_cik", "get_recent_filings", "get_filing_document", "get_company_facts", "get_concept", "search_filings"],
        description: "Which EDGAR operation to perform.",
      },
      ticker: { type: "string", description: "For `lookup_cik`: stock ticker symbol (case-insensitive)." },
      company: { type: "string", description: "For most kinds: ticker (e.g. 'AAPL') or 10-digit CIK." },
      form_types: {
        type: "array",
        items: { type: "string" },
        description: "For `get_recent_filings`: filter to specific forms, e.g. ['10-K', '10-Q', '8-K']. Omit for all forms.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 200,
        description: "For `get_recent_filings`: max filings to return (default 25).",
      },
      accession_number: {
        type: "string",
        description: "For `get_filing_document`: accession number with dashes, e.g. '0000320193-24-000123'.",
      },
      primary_document: {
        type: "string",
        description: "For `get_filing_document`: primary document filename from `get_recent_filings`, e.g. 'aapl-20240928.htm'.",
      },
      max_chars: {
        type: "integer",
        minimum: 1000,
        maximum: 500000,
        description: "For `get_filing_document`: truncate returned text to this many characters (default 20000). Filings are huge — start small.",
      },
      concept: {
        type: "string",
        description: "For `get_concept`: XBRL concept name, e.g. 'Revenues', 'Assets', 'NetIncomeLoss', 'CashAndCashEquivalentsAtCarryingValue'.",
      },
      taxonomy: {
        type: "string",
        enum: ["us-gaap", "ifrs-full", "dei", "srt"],
        description: "For `get_concept`: XBRL taxonomy (default 'us-gaap', which covers most US companies).",
      },
      query: { type: "string", description: "For `search_filings`: search query. Quoted phrases supported." },
      forms: {
        type: "array",
        items: { type: "string" },
        description: "For `search_filings`: restrict to certain form types.",
      },
      from_date: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "For `search_filings`: YYYY-MM-DD lower bound on filing date.",
      },
      to_date: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "For `search_filings`: YYYY-MM-DD upper bound on filing date.",
      },
    },
    required: ["kind"],
  },
};
