/**
 * Extract Markdown ATX headings for outline / TOC (skips fenced code).
 * Id allocation matches renderSafeMarkdown heading anchors.
 */

export type MarkdownOutlineItem = {
    /** Heading level 1–6 */
    level: number
    /** Plain display text (inline markdown stripped) */
    text: string
    /** 1-based source line */
    line: number
    /** Stable slug for preview scroll / tree key */
    id: string
}

export type MarkdownOutlineNode = MarkdownOutlineItem & {
    children: MarkdownOutlineNode[]
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/

/** Strip common inline markdown for TOC labels. */
export function plainHeadingText(raw: string): string {
    return raw
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*_~]+/g, '')
        .trim()
}

export function slugifyHeading(text: string): string {
    const s = text
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    return s || 'heading'
}

/** Sequential unique ids — call once per document walk (render or extract). */
export function createHeadingIdAllocator(): (plainText: string) => string {
    const used = new Map<string, number>()
    return (plainText: string) => {
        const base = slugifyHeading(plainText)
        const n = (used.get(base) ?? 0) + 1
        used.set(base, n)
        return n === 1 ? base : `${base}-${n}`
    }
}

/**
 * Scan source for ATX headings. Fenced ``` blocks are skipped so code
 * that looks like `# title` is not treated as a heading.
 */
export function extractMarkdownOutline(source: string): MarkdownOutlineItem[] {
    const normalized = source.replace(/\r\n/g, '\n')
    if (!normalized.trim()) return []

    const lines = normalized.split('\n')
    const allocId = createHeadingIdAllocator()
    const out: MarkdownOutlineItem[] = []

    let i = 0
    while (i < lines.length) {
        const line = lines[i]
        if (line.startsWith('```')) {
            i += 1
            while (i < lines.length && !lines[i].startsWith('```')) i += 1
            if (i < lines.length) i += 1
            continue
        }

        const heading = HEADING_RE.exec(line)
        if (heading) {
            const level = heading[1].length
            const text = plainHeadingText(heading[2])
            if (text) {
                out.push({
                    level,
                    text,
                    line: i + 1,
                    id: allocId(text),
                })
            }
            i += 1
            continue
        }
        i += 1
    }
    return out
}

/**
 * Active TOC heading for a 1-based editor line: last heading at or above the line.
 * Empty outline → null.
 */
export function findOutlineIdAtLine(
    items: MarkdownOutlineItem[],
    line: number,
): string | null {
    if (!items.length) return null
    const safeLine = Math.max(1, Math.floor(line))
    let active: MarkdownOutlineItem | null = null
    for (const item of items) {
        if (item.line <= safeLine) active = item
        else break
    }
    return active?.id ?? items[0]?.id ?? null
}

/** Nest flat outline items by heading level (Youdao-style tree). */
export function buildMarkdownOutlineTree(items: MarkdownOutlineItem[]): MarkdownOutlineNode[] {
    const roots: MarkdownOutlineNode[] = []
    const stack: MarkdownOutlineNode[] = []

    for (const item of items) {
        const node: MarkdownOutlineNode = {...item, children: []}
        while (stack.length && stack[stack.length - 1].level >= node.level) {
            stack.pop()
        }
        if (!stack.length) {
            roots.push(node)
        } else {
            stack[stack.length - 1].children.push(node)
        }
        stack.push(node)
    }
    return roots
}
