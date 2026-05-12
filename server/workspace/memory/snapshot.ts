// One-shot loader that picks between atomic and topic memory layouts
// at call time. Centralises the format-detection branch so callers
// (= the system-prompt builder) can `await` once and pass the
// pre-loaded snapshot down instead of doing sync I/O during prompt
// assembly.
//
// Before this helper, `server/agent/prompt.ts` called
// `loadAllMemoryEntriesSync` / `loadAllTopicFilesSync` directly,
// which existed only to support that sync call site. Dropping the
// sync variants entirely shrinks the IO surface and removes a
// duplicated dirent-filter loop.

import { hasTopicFormat } from "./topic-detect.js";
import { loadAllMemoryEntries } from "./io.js";
import { loadAllTopicFiles } from "./topic-io.js";
import type { MemoryEntry } from "./types.js";
import type { TopicMemoryFile } from "./topic-types.js";

export type MemorySnapshot = { format: "atomic"; entries: readonly MemoryEntry[] } | { format: "topic"; files: readonly TopicMemoryFile[] };

export async function loadMemorySnapshot(workspacePath: string): Promise<MemorySnapshot> {
  if (hasTopicFormat(workspacePath)) {
    return { format: "topic", files: await loadAllTopicFiles(workspacePath) };
  }
  return { format: "atomic", entries: await loadAllMemoryEntries(workspacePath) };
}
