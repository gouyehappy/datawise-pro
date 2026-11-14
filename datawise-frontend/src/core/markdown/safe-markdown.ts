/**
 * Markdown → HTML with allowlist rewrite + DOMPurify final pass.
 * Escapes unsafe markup; http(s)/mailto/# links only.
 * Used by AI chat replies and local-file preview.
 *
 * Progress invariant: every outer-loop iteration must advance `i`, or the scan
 * aborts. Incomplete ATX headings (`## `) previously matched a paragraph-break
 * regex but not the titled-heading parser, leaving `i` stuck → main-thread hang.
 */

import createDOMPurify from 'dompurify'
import type {Config as DomPurifyConfig} from 'dompurify'
import {
    createHeadingIdAllocator,
    plainHeadingText,
} from '@/core/markdown/markdown-outline'

type DomPurifier = ReturnType<typeof createDOMPurify>

let purifier: DomPurifier | null | undefined

function getPurifier(): DomPurifier | null {
    if (purifier !== undefined) {
        return purifier
    }
    if (typeof window === 'undefined' || !window.document) {
        purifier = null
        return null
    }
    try {
        const instance = createDOMPurify(window)
        purifier = instance && typeof instance.sanitize === 'function' ? instance : null
    } catch {
        // Stub / incomplete DOM (unit tests) — allowlist rewrite remains the primary filter.
        purifier = null
    }
    return purifier
}

export type RenderSafeMarkdownOptions = {
    /** Resolve relative img/src and md image/link targets (e.g. to file:// or absolute). */
    resolveUrl?: (url: string) => string
}

/** @deprecated Prefer RenderSafeMarkdownOptions */
export type RenderLocalMarkdownOptions = RenderSafeMarkdownOptions

const VOID_TAGS = new Set(['br', 'hr', 'img'])
const ALLOWED_TAGS = new Set([
    'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td',
    'th', 'thead', 'tr', 'ul',
])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
    a: new Set(['href', 'title', 'align']),
    img: new Set(['src', 'alt', 'title', 'width', 'height', 'align']),
    p: new Set(['align']),
    div: new Set(['align']),
    h1: new Set(['align']),
    h2: new Set(['align']),
    h3: new Set(['align']),
    h4: new Set(['align']),
    h5: new Set(['align']),
    h6: new Set(['align']),
    td: new Set(['align']),
    th: new Set(['align']),
    span: new Set(['align']),
}

/** ATX heading with optional title — includes incomplete `## ` / `#`. */
const ATX_HEADING_RE = /^(#{1,6})(?:\s+(.*))?$/
/** Shared “block boundary” probes used by paragraph scanning (must stay aligned with parsers). */
const ATX_HEADING_BOUNDARY_RE = /^(#{1,6})(?:\s|$)/
const BLOCKQUOTE_RE = /^>\s?/
const UL_ITEM_RE = /^\s*[-*+]\s+/
const OL_ITEM_RE = /^\s*\d+\.\s+/
const HR_RE = /^\s*([-*_])\1{2,}\s*$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function safeHref(raw: string, resolveUrl?: (url: string) => string): string | null {
    const resolved = (resolveUrl ? resolveUrl(raw) : raw).trim()
    if (!resolved) return null
    const lower = resolved.toLowerCase()
    // Deny file:// (local path probe) and non-http(s)/mailto schemes.
    if (
        lower.startsWith('http://')
        || lower.startsWith('https://')
        || lower.startsWith('mailto:')
    ) {
        return escapeHtml(resolved)
    }
    if (lower.startsWith('#') && !lower.includes(':')) {
        return escapeHtml(resolved)
    }
    return null
}

function safeSrc(raw: string, resolveUrl?: (url: string) => string): string | null {
    const resolved = (resolveUrl ? resolveUrl(raw) : raw).trim()
    if (!resolved) return null
    const lower = resolved.toLowerCase()
    // Deny file:// and data:image/svg+xml (scriptable); allow raster data URIs only.
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
        return escapeHtml(resolved)
    }
    if (
        lower.startsWith('data:image/png')
        || lower.startsWith('data:image/jpeg')
        || lower.startsWith('data:image/jpg')
        || lower.startsWith('data:image/gif')
        || lower.startsWith('data:image/webp')
    ) {
        return escapeHtml(resolved)
    }
    return null
}

function sanitizeAttrs(tag: string, rawAttrs: string, resolveUrl?: (url: string) => string): string {
    const allowed = ALLOWED_ATTRS[tag]
    if (!allowed || !rawAttrs.trim()) return ''
    const out: string[] = []
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
    let match: RegExpExecArray | null
    while ((match = re.exec(rawAttrs)) !== null) {
        const name = match[1].toLowerCase()
        if (!allowed.has(name)) continue
        const value = match[2] ?? match[3] ?? match[4] ?? ''
        if (name === 'href') {
            const href = safeHref(value, resolveUrl)
            if (!href) continue
            out.push(`href="${href}"`)
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('file:')) {
                out.push('target="_blank"', 'rel="noopener noreferrer"')
            }
            continue
        }
        if (name === 'src') {
            const src = safeSrc(value, resolveUrl)
            if (!src) continue
            out.push(`src="${src}"`)
            continue
        }
        if ((name === 'width' || name === 'height') && !/^\d+%?$/.test(value.trim())) continue
        if (name === 'align') {
            const align = value.trim().toLowerCase()
            if (!['left', 'center', 'right', 'justify'].includes(align)) continue
            out.push(`align="${align}"`)
            continue
        }
        out.push(`${name}="${escapeHtml(value)}"`)
    }
    return out.length ? ` ${out.join(' ')}` : ''
}

const PURIFY_CONFIG: DomPurifyConfig = {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [
        'href', 'title', 'align', 'src', 'alt', 'width', 'height',
        'class', 'id', 'data-lang', 'target', 'rel',
    ],
    // Match review: only http(s), mailto, and in-page fragments.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
    ALLOW_DATA_ATTR: false,
}

function purifyHtml(html: string): string {
    const purify = getPurifier()
    if (!purify) {
        return html
    }
    return purify.sanitize(html, PURIFY_CONFIG)
}

/** Allowlist-rewrite HTML tags; escape anything else that looks like a tag. */
function sanitizeHtmlTags(source: string, resolveUrl?: (url: string) => string): string {
    // Drop comments and dangerous blocks entirely.
    let text = source
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)\b[^>]*>/gi, '')

    const rewritten = text.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)\/?>/g, (full, rawTag: string, rawAttrs: string) => {
        const tag = rawTag.toLowerCase()
        if (!ALLOWED_TAGS.has(tag)) return escapeHtml(full)
        if (full.startsWith('</')) return `</${tag}>`
        const attrs = sanitizeAttrs(tag, rawAttrs, resolveUrl)
        if (VOID_TAGS.has(tag) || /\/>\s*$/.test(full)) return `<${tag}${attrs} />`
        return `<${tag}${attrs}>`
    })
    return purifyHtml(rewritten)
}

function renderInline(text: string, resolveUrl?: (url: string) => string): string {
    let out = escapeHtml(text)
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
    out = replaceMarkdownImages(out, resolveUrl)
    out = replaceMarkdownLinks(out, resolveUrl)
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
    out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    out = out.replace(/_([^_\n]+)_/g, '<em>$1</em>')
    return out
}

function replaceMarkdownImages(text: string, resolveUrl?: (url: string) => string): string {
    return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, url: string) => {
        const src = safeSrc(url, resolveUrl)
        if (!src) return escapeHtml(alt || '')
        const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : ' alt=""'
        return `<img class="lf-md__img" src="${src}"${altAttr} />`
    })
}

/** Replace `[label](url)` with balanced parentheses inside the URL. */
function replaceMarkdownLinks(text: string, resolveUrl?: (url: string) => string): string {
    let result = ''
    let i = 0
    let guard = 0
    const max = text.length + 2
    while (i < text.length) {
        guard += 1
        if (guard > max) break
        const start = i
        if (text[i] === '!' && text[i + 1] === '[') {
            // image handled earlier
            result += text[i]
            i += 1
            continue
        }
        const open = text.indexOf('[', i)
        if (open < 0) {
            result += text.slice(i)
            break
        }
        const mid = text.indexOf('](', open)
        if (mid < 0) {
            result += text.slice(i)
            break
        }
        let depth = 1
        let j = mid + 2
        while (j < text.length && depth > 0) {
            const ch = text[j]
            if (ch === '(') depth += 1
            else if (ch === ')') depth -= 1
            j += 1
        }
        if (depth !== 0) {
            result += text.slice(i, open + 1)
            i = open + 1
            continue
        }
        result += text.slice(i, open)
        const label = text.slice(open + 1, mid)
        const url = text.slice(mid + 2, j - 1)
        const href = safeHref(url, resolveUrl)
        result += href
            ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
            : label
        i = j
        if (i <= start) i = start + 1
    }
    return result
}

function parseTableRow(line: string): string[] {
    return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
}

function renderTable(lines: string[], resolveUrl?: (url: string) => string): string {
    if (lines.length < 2) return ''
    const headers = parseTableRow(lines[0])
    const body = lines.slice(2)
    const head = headers.map((h) => `<th>${renderInline(h, resolveUrl)}</th>`).join('')
    const rows = body
        .map((line) => {
            const cells = parseTableRow(line)
            return `<tr>${cells.map((c) => `<td>${renderInline(c, resolveUrl)}</td>`).join('')}</tr>`
        })
        .join('')
    return `<div class="lf-md__table-wrap"><table class="lf-md__table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
}

function isHtmlHeavyLine(line: string): boolean {
    const trimmed = line.trim()
    if (!trimmed) return false
    return /^<\/?[a-zA-Z]/.test(trimmed)
}

function htmlTagDepthDelta(line: string): number {
    let delta = 0
    const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g
    let match: RegExpExecArray | null
    while ((match = re.exec(line)) !== null) {
        const full = match[0]
        const tag = match[1].toLowerCase()
        if (VOID_TAGS.has(tag) || /\/>\s*$/.test(full)) continue
        if (full.startsWith('</')) delta -= 1
        else delta += 1
    }
    return delta
}

function isAtxHeadingLine(line: string): boolean {
    return ATX_HEADING_RE.test(line)
}

function isParagraphBoundary(line: string, nextLine: string | undefined): boolean {
    if (!line.trim()) return true
    if (line.startsWith('```')) return true
    if (ATX_HEADING_BOUNDARY_RE.test(line)) return true
    if (BLOCKQUOTE_RE.test(line)) return true
    if (UL_ITEM_RE.test(line)) return true
    if (OL_ITEM_RE.test(line)) return true
    if (HR_RE.test(line)) return true
    if (isHtmlHeavyLine(line)) return true
    if (line.trim().startsWith('|') && nextLine != null && TABLE_SEP_RE.test(nextLine)) return true
    return false
}

/**
 * Render Markdown (+ allowlisted HTML) to sanitized HTML.
 * Guarantees forward progress on the line index — pathological input must not hang.
 */
export function renderSafeMarkdown(
    source: string,
    options: RenderSafeMarkdownOptions = {},
): string {
    const resolveUrl = options.resolveUrl
    const normalized = source.replace(/\r\n/g, '\n')
    if (!normalized.trim()) return ''

    const lines = normalized.split('\n')
    const parts: string[] = []
    const allocHeadingId = createHeadingIdAllocator()
    let i = 0
    // Absolute ceiling: one advance per line plus a small slack for double-steps (tables).
    const maxIterations = lines.length * 2 + 8
    let iterations = 0

    while (i < lines.length) {
        iterations += 1
        if (iterations > maxIterations) {
            // Should be unreachable if every branch advances; abort rather than hang.
            break
        }
        const cursor = i
        const line = lines[i]

        if (line.startsWith('```')) {
            const lang = line.slice(3).trim()
            const code: string[] = []
            i += 1
            while (i < lines.length && !lines[i].startsWith('```')) {
                code.push(lines[i])
                i += 1
            }
            if (i < lines.length) i += 1
            const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : ''
            parts.push(
                `<pre class="lf-md__code"${langAttr}><code>${escapeHtml(code.join('\n'))}</code></pre>`,
            )
        } else if (isHtmlHeavyLine(line)) {
            // Pass through HTML blocks (allowlisted) using tag-depth so inner text stays inside.
            const block: string[] = []
            let depth = 0
            let htmlGuard = 0
            const htmlMax = lines.length - i + 2
            do {
                htmlGuard += 1
                if (htmlGuard > htmlMax) break
                block.push(lines[i])
                depth += htmlTagDepthDelta(lines[i])
                i += 1
                if (depth <= 0) break
                if (i >= lines.length) break
                // Bail out if a markdown heading appears while still open (malformed HTML).
                if (ATX_HEADING_BOUNDARY_RE.test(lines[i]) && !isHtmlHeavyLine(lines[i])) break
            } while (true)
            const html = sanitizeHtmlTags(block.join('\n'), resolveUrl)
            parts.push(`<div class="lf-md__html">${html}</div>`)
        } else if (HR_RE.test(line)) {
            parts.push('<hr class="lf-md__hr"/>')
            i += 1
        } else if (isAtxHeadingLine(line)) {
            // Includes incomplete ATX headings (`## ` / `#`) so paragraph scan cannot stall.
            const heading = ATX_HEADING_RE.exec(line)!
            const level = heading[1].length
            const rawTitle = (heading[2] ?? '').trim()
            const plain = plainHeadingText(rawTitle)
            const idAttr = plain
                ? ` id="${escapeHtml(allocHeadingId(plain))}"`
                : ''
            parts.push(
                `<h${level}${idAttr} class="lf-md__h">${renderInline(rawTitle, resolveUrl)}</h${level}>`,
            )
            i += 1
        } else if (
            line.trim().startsWith('|')
            && i + 1 < lines.length
            && TABLE_SEP_RE.test(lines[i + 1])
        ) {
            const tableLines = [line, lines[i + 1]]
            i += 2
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i])
                i += 1
            }
            parts.push(renderTable(tableLines, resolveUrl))
        } else if (BLOCKQUOTE_RE.test(line)) {
            const quote: string[] = []
            while (i < lines.length && BLOCKQUOTE_RE.test(lines[i])) {
                quote.push(lines[i].replace(/^>\s?/, ''))
                i += 1
            }
            parts.push(
                `<blockquote class="lf-md__quote">${renderInline(quote.join(' '), resolveUrl)}</blockquote>`,
            )
        } else if (UL_ITEM_RE.test(line)) {
            const items: string[] = []
            while (i < lines.length && UL_ITEM_RE.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
                i += 1
            }
            parts.push(
                `<ul class="lf-md__list">${items.map((item) => `<li>${renderInline(item, resolveUrl)}</li>`).join('')}</ul>`,
            )
        } else if (OL_ITEM_RE.test(line)) {
            const items: string[] = []
            while (i < lines.length && OL_ITEM_RE.test(lines[i])) {
                items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
                i += 1
            }
            parts.push(
                `<ol class="lf-md__list">${items.map((item) => `<li>${renderInline(item, resolveUrl)}</li>`).join('')}</ol>`,
            )
        } else if (!line.trim()) {
            i += 1
        } else {
            const para: string[] = []
            while (i < lines.length && !isParagraphBoundary(lines[i], lines[i + 1])) {
                para.push(lines[i].trim())
                i += 1
            }
            if (para.length) {
                parts.push(`<p class="lf-md__p">${renderInline(para.join(' '), resolveUrl)}</p>`)
            }
        }

        // Hard progress: never stall the outer scan (main-thread hang).
        if (i <= cursor) i = cursor + 1
    }

    return purifyHtml(parts.join(''))
}

/** @deprecated Prefer renderSafeMarkdown */
export const renderLocalMarkdown = renderSafeMarkdown

/** Convert an absolute filesystem path to a file:// URL (best-effort for img src). */
export function absolutePathToFileUrl(absPath: string): string {
    const normalized = absPath.replace(/\\/g, '/')
    if (/^[a-zA-Z]:\//.test(normalized)) {
        return `file:///${normalized}`
    }
    if (normalized.startsWith('/')) {
        return `file://${normalized}`
    }
    return normalized
}
