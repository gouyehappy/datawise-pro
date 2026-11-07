export interface AiAssistantReference {
    url: string
    title?: string
}

const MAX_REFERENCES = 8

/** Markdown links: [title](https://…) — title may be empty. */
const MD_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi

/** Bare http(s) URLs; stops at common trailing punctuation. */
const BARE_URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/gi

function normalizeUrl(raw: string): string {
    return raw.replace(/[),.]+$/g, '')
}

function displayHost(url: string): string {
    try {
        return new URL(url).hostname || url
    } catch {
        return url
    }
}

/**
 * Extract markdown + bare http(s) links from assistant prose.
 * Dedupes by normalized URL; caps at {@link MAX_REFERENCES}.
 */
export function extractUrlReferences(text: string, max = MAX_REFERENCES): AiAssistantReference[] {
    if (!text?.trim() || max <= 0) return []
    const seen = new Set<string>()
    const out: AiAssistantReference[] = []

    const push = (urlRaw: string, title?: string) => {
        if (out.length >= max) return
        const url = normalizeUrl(urlRaw.trim())
        if (!/^https?:\/\//i.test(url)) return
        const key = url.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        const trimmedTitle = title?.trim()
        out.push({
            url,
            title: trimmedTitle && trimmedTitle !== url ? trimmedTitle : displayHost(url),
        })
    }

    let match: RegExpExecArray | null
    MD_LINK_RE.lastIndex = 0
    while ((match = MD_LINK_RE.exec(text)) && out.length < max) {
        push(match[2]!, match[1])
    }

    // Remove markdown links so bare scan does not double-count the same href.
    const withoutMd = text.replace(MD_LINK_RE, ' ')
    BARE_URL_RE.lastIndex = 0
    while ((match = BARE_URL_RE.exec(withoutMd)) && out.length < max) {
        push(match[0]!)
    }

    return out
}
