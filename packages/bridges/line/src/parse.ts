// Pure parsing helpers for the LINE bridge webhook.

export interface LineMessage {
  type: string;
  text?: string;
  /** LINE content id — present on media types (image / video / audio
   *  / file). The actual bytes live behind a separate Data API call
   *  (`/v2/bot/message/<id>/content`); the webhook only carries the
   *  reference. */
  id?: string;
}

export interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string; type?: string };
  message?: LineMessage;
}

export interface LineWebhookBody {
  events: LineEvent[];
}

/** Discriminated union — the webhook may surface text or media.
 *  Callers branch on `kind` and either send text straight to chat
 *  or download the media bytes via the LINE Data API.
 *
 *  PR-C of #1222: image is the only media kind we forward today.
 *  Video / audio / file extend this union if/when they become
 *  worth fanning out to the agent. */
export type IncomingLineMessage = { kind: "text"; userId: string; text: string } | { kind: "image"; userId: string; imageMessageId: string };

/**
 * Reduce a LINE webhook event to the actionable shape. Returns null
 * for non-actionable events (non-message types, missing fields,
 * unsupported media). Pure — no side effects, no allowlist check.
 */
export function extractIncomingLineMessage(event: LineEvent): IncomingLineMessage | null {
  if (event.type !== "message") return null;
  const userId = event.source?.userId;
  if (!userId) return null;
  const { message } = event;
  if (!message) return null;
  if (message.type === "text") {
    const text = message.text ?? "";
    if (!text.trim()) return null;
    return { kind: "text", userId, text };
  }
  if (message.type === "image" && typeof message.id === "string" && message.id.length > 0) {
    return { kind: "image", userId, imageMessageId: message.id };
  }
  return null;
}

/** Best-effort JSON parse for the webhook body — null on malformed input. */
export function parseLineWebhookBody(raw: string): LineWebhookBody | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { events?: unknown }).events)) {
      return null;
    }
    return parsed as LineWebhookBody;
  } catch {
    return null;
  }
}
