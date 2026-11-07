/** Closed think / thinking blocks (case-insensitive, multiline). */
const THINK_BLOCK_RE = /<(think|thinking)\b[^>]*>([\s\S]*?)<\/\1>/gi

/** Trailing unclosed think tag — hide from the visible answer while streaming. */
const OPEN_THINK_TAIL_RE = /<(think|thinking)\b[^>]*>[\s\S]*$/i

export interface ThinkSplit {
    content: string
    thinking: string
}

/**
 * Pull closed `<think>` / `<thinking>` blocks into `thinking` and return the
 * remaining visible answer. Multiple blocks are joined with blank lines.
 * Does not consume an unclosed trailing tag (use `drainThinkTags` / finalize).
 */
export function stripThinkTags(text: string): ThinkSplit {
    if (!text) return {content: '', thinking: ''}
    const parts: string[] = []
    const content = text
        .replace(THINK_BLOCK_RE, (_match, _tag: string, inner: string) => {
            const trimmed = inner.trim()
            if (trimmed) parts.push(trimmed)
            return ''
        })
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    return {content, thinking: parts.join('\n\n')}
}

/**
 * Like `stripThinkTags`, but also moves a trailing unclosed `<think>` into
 * `thinking` so stored messages never keep raw open tags.
 */
export function drainThinkTags(text: string): ThinkSplit {
    const closed = stripThinkTags(text)
    const openMatch = OPEN_THINK_TAIL_RE.exec(closed.content)
    if (!openMatch || openMatch.index == null) return closed
    const openRaw = closed.content.slice(openMatch.index)
    const inner = openRaw.replace(/^<(think|thinking)\b[^>]*>/i, '').trim()
    const content = closed.content
        .slice(0, openMatch.index)
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    return {
        content,
        thinking: mergeThinking(closed.thinking, inner),
    }
}

/** Drop a trailing unclosed think block so mid-stream UI does not leak tags. */
export function stripOpenThinkTail(text: string): string {
    if (!text) return ''
    return text.replace(OPEN_THINK_TAIL_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** Merge newly extracted thinking into an existing buffer. */
export function mergeThinking(existing: string | undefined, next: string): string {
    const a = (existing || '').trim()
    const b = (next || '').trim()
    if (!a) return b
    if (!b) return a
    if (a.includes(b)) return a
    return `${a}\n\n${b}`
}
