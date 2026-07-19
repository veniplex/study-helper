/**
 * Lightweight chat dock constants. Kept in their own module (no React / AI-SDK
 * imports) so the always-mounted `ChatDock` and `BottomNav` can reference them
 * without pulling the heavy `ConversationPanel` (AI SDK + markdown + katex) into
 * the shared layout bundle — that panel is loaded via `next/dynamic` on open.
 */
export const LAST_CHAT_KEY = "studyhelper.lastChatId"
export const CHAT_OPEN_EVENT = "studyhelper:chat-open"
