/**
 * PERF-05: window long AI chat histories so older heavy rows stay unmounted.
 * Variable-height messages (analysis / charts / code) are a poor fit for fixed-row
 * virtualization — keep a mounted tail and reveal older batches on demand.
 */

/** Always keep at least this many newest messages mounted. */
export const AI_CHAT_MESSAGE_WINDOW_TAIL = 40

/** Start windowing once the thread exceeds this length. */
export const AI_CHAT_MESSAGE_WINDOW_THRESHOLD = 48

/** How many older messages each "show earlier" click reveals. */
export const AI_CHAT_MESSAGE_WINDOW_REVEAL_STEP = 40

export type AiChatMessageWindow = {
    /** Inclusive start index into the full messages array. */
    start: number
    /** Messages currently hidden above the window. */
    hiddenCount: number
}

/**
 * Resolve the visible slice start for a chat thread.
 * `extraReveal` is additional older messages the user has requested.
 */
export function resolveAiChatMessageWindow(
    total: number,
    extraReveal = 0,
    options?: {
        tail?: number
        threshold?: number
    },
): AiChatMessageWindow {
    const tail = Math.max(1, options?.tail ?? AI_CHAT_MESSAGE_WINDOW_TAIL)
    const threshold = Math.max(tail, options?.threshold ?? AI_CHAT_MESSAGE_WINDOW_THRESHOLD)
    if (total <= threshold) {
        return {start: 0, hiddenCount: 0}
    }
    const reveal = Math.max(0, Math.floor(extraReveal))
    const keep = Math.min(total, tail + reveal)
    const start = Math.max(0, total - keep)
    return {start, hiddenCount: start}
}
