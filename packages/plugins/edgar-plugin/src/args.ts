// Zod input schema for the `edgar` tool. Lives in its own
// module so the unit tests in `test/test_args_validation.ts`
// can import it without spinning up the whole plugin runtime.
//
// Each regex below is a security boundary: `accession_number`,
// `primary_document`, and `concept` are interpolated into URL
// path segments on `sec.gov`. Loosening any of these regexes
// re-opens the path-injection class flagged in PR #1270.

import { z } from "zod";

// SEC accession number canonical form: 10-digit filer prefix +
// 2-digit year + 6-digit sequence (`0000320193-24-000123`).
export const ACCESSION_NUMBER_RE = /^\d{10}-\d{2}-\d{6}$/;

// SEC primary-document filenames are kebab-case alphanumerics
// with extensions like `.htm` / `.html` / `.xml` / `.txt`.
// Reject anything that could escape the filing directory.
export const PRIMARY_DOCUMENT_RE = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9_.-]*$/;

// XBRL concept identifiers are PascalCase alphanumeric tokens
// (e.g. `Revenues`, `NetIncomeLoss`, `EarningsPerShareBasic`).
// SEC accepts underscores in some taxonomies.
export const CONCEPT_RE = /^[A-Za-z]\w*$/;

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const Args = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("lookup_cik"),
    ticker: z.string().min(1),
  }),
  z.object({
    kind: z.literal("get_recent_filings"),
    company: z.string().min(1),
    form_types: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(200).default(25),
  }),
  z.object({
    kind: z.literal("get_filing_document"),
    company: z.string().min(1),
    accession_number: z.string().regex(ACCESSION_NUMBER_RE, "accession_number must match NNNNNNNNNN-NN-NNNNNN"),
    primary_document: z.string().regex(PRIMARY_DOCUMENT_RE, "primary_document must be a bare filename (no path separators or `..`)"),
    max_chars: z.number().int().min(1000).max(500000).default(20000),
  }),
  z.object({
    kind: z.literal("get_company_facts"),
    company: z.string().min(1),
  }),
  z.object({
    kind: z.literal("get_concept"),
    company: z.string().min(1),
    concept: z.string().regex(CONCEPT_RE, "concept must be an XBRL identifier (alphanumeric, starts with a letter)"),
    taxonomy: z.enum(["us-gaap", "ifrs-full", "dei", "srt"]).default("us-gaap"),
  }),
  z
    .object({
      kind: z.literal("search_filings"),
      query: z.string().min(1),
      forms: z.array(z.string()).optional(),
      from_date: z.string().regex(ISO_DATE_RE).optional(),
      to_date: z.string().regex(ISO_DATE_RE).optional(),
    })
    .refine((val) => Boolean(val.from_date) === Boolean(val.to_date), {
      message: "from_date and to_date must be provided together (or both omitted)",
    }),
]);

export type EdgarArgs = z.infer<typeof Args>;
