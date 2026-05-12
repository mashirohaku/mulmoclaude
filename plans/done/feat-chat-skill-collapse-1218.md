# feat(chat): collapse skill body in canvas (#1218)

When the LLM invokes a skill via the `Skill` tool, Claude CLI synthesises
a fake assistant message containing the entire SKILL.md body. Our server
captures that as an ordinary `{source:"assistant",type:"text"}` entry, so
the canvas renders the whole skill body as a regular assistant reply.

This PR detects skill bodies via the **preceding tool_call's `toolName`**
(structural — survives Claude CLI text-prefix changes) and writes them
as a new `type:"skill"` jsonl entry. The host renders skill entries via
a dedicated View that collapses by default to skill name +
frontmatter description.

Issue: [#1218](https://github.com/receptron/mulmoclaude/issues/1218)

## Server-side

- `server/api/routes/agent.ts` — `EventContext` gains a `pendingSkill`
  flag set when a `tool_call` with `toolName === "Skill"` arrives. The
  next text flush consumes the flag and writes `type:"skill"`.
- Skill metadata (`skillScope` + `skillPath`) resolved by feeding
  `args.skill` into the existing `discoverSkills()` (project > user >
  preset precedence). When the lookup misses (skill went away mid-run),
  fall back to `skillScope: "unknown"` + null path.
- Body's full text kept in `message` for archival + expand-on-click.
- Canary `log.warn` fires if the body doesn't start with the current
  Claude CLI prefix `Base directory for this skill: `. Detection still
  works (sequence-based) but the warning surfaces format drift.

## Client-side

- `EVENT_TYPES.skill` + `SkillEntry` shape + `isSkillEntry` guard in
  `src/types/{events,session}.ts`.
- `makeSkillResult(message, skillName, skillScope, skillPath)` in
  `src/utils/tools/result.ts` — produces a `ToolResultComplete` with
  `toolName: "skill"` and the metadata in `data`.
- `parseSessionEntries` dispatches skill entries through that builder.
- `src/plugins/skill/{index.ts,View.vue,Preview.vue}` — new plugin.
  - View: collapsed default → `<skill-name> · <description>`. Toggle
    expands to the full markdown-rendered body.
  - Preview (chat-history thumbnail): one-line `🪄 <skill-name>`.
- Frontmatter parser shared between server and host: extracted to
  `packages/protocol` or a new shared util — avoid double-shipping the
  YAML logic. Decide during implementation; if extracting is fiddly,
  duplicate ~30 LOC and add a test that pins format parity.

## Tests

- `test/agent/test_skillTagging.ts` — state machine: Skill tool_call →
  text flush emits `type:"skill"`; non-Skill tool_call resets pending;
  text without preceding Skill stays `type:"text"`; canary warns on
  prefix mismatch.
- `test/utils/session/test_sessionEntries.ts` — extend with skill entry
  → `makeSkillResult` round-trip.
- `test/plugins/skill/test_View.ts` (or in-Vue test if pattern exists) —
  collapsed vs expanded rendering.

## Acceptance

- [ ] In a fresh session, invoke any skill → canvas shows only
  `<skill-name> · <description>` with expand toggle
- [ ] jsonl entry has `type:"skill"`, `skillName`, `skillScope`,
  `skillPath`, `message`
- [ ] Existing `type:"text"` sessions render unchanged (no migration)
- [ ] `yarn typecheck / lint / build / test` all green
- [ ] Canary log emits if Claude CLI changes the body prefix

## Out of scope (separate follow-ups)

- AskUserQuestion answer tagging — speculative; revisit after observing
  real jsonl
- Compaction-summary tagging — same
- Large-output collapse for Read / Bash — UI-side decision, no jsonl
  format change needed
