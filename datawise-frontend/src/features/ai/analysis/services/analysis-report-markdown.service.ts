export interface AnalysisReportSection {
    title: string
    /** Flattened HTML for export / legacy consumers. */
    html: string
    /** Structured blocks for rich UI (code viewers, etc.). */
    blocks: AnalysisReportBlock[]
}

export type AnalysisReportBlock =
    | {type: 'html'; html: string}
    | {type: 'code'; lang: string; code: string}

export interface ParsedAnalysisReport {
    title: string
    sections: AnalysisReportSection[]
    excerpt: string
    /** True when input was truncated before parse to avoid OOM / RangeError. */
    truncated?: boolean
}

/** Guardrails so a bloated persisted report cannot freeze Agent open. */
export const ANALYSIS_REPORT_MAX_MARKDOWN_CHARS = 200_000
export const ANALYSIS_REPORT_MAX_CODE_CHARS = 80_000
export const ANALYSIS_REPORT_MAX_SECTION_HTML_CHARS = 120_000

export interface AnalysisReportMeta {
    title: string
    excerpt: string
    sectionCount: number
    truncated: boolean
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function plainExcerpt(markdown: string, maxLen = 140): string {
    const text = markdown
        .replace(/^#+\s+/gm, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\|/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    if (!text) return ''
    return text.length <= maxLen ? text : `${text.slice(0, maxLen).trim()}…`
}

function clampMarkdown(markdown: string): {text: string; truncated: boolean} {
    if (!markdown) return {text: '', truncated: false}
    if (markdown.length <= ANALYSIS_REPORT_MAX_MARKDOWN_CHARS) {
        return {text: markdown, truncated: false}
    }
    return {
        text: `${markdown.slice(0, ANALYSIS_REPORT_MAX_MARKDOWN_CHARS)}\n\n…\n`,
        truncated: true,
    }
}

function renderInlineMarkdown(text: string): string {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

function renderTableBlock(lines: string[]): string {
    if (lines.length < 2) return ''
    const parseRow = (line: string) =>
        line
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim())

    const headers = parseRow(lines[0])
    // Cap table body rows — huge previews must not explode the DOM string.
    const bodyLines = lines.slice(2, 52)
    const headHtml = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
    const bodyHtml = bodyLines
        .map((line) => {
            const cells = parseRow(line)
            return `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
        })
        .join('')
    const overflow =
        lines.length > 52
            ? `<p class="report-paragraph">… (${lines.length - 52} more rows omitted)</p>`
            : ''
    return `<div class="report-table-wrap"><table class="report-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>${overflow}`
}

function codeBlockHtml(lang: string, code: string): string {
    const label = lang ? `<span class="report-code__lang">${escapeHtml(lang)}</span>` : ''
    return `<div class="report-code">${label}<pre><code>${escapeHtml(code)}</code></pre></div>`
}

function clampCode(code: string): {code: string; truncated: boolean} {
    if (code.length <= ANALYSIS_REPORT_MAX_CODE_CHARS) {
        return {code, truncated: false}
    }
    return {
        code: `${code.slice(0, ANALYSIS_REPORT_MAX_CODE_CHARS)}\n…`,
        truncated: true,
    }
}

function renderSectionBody(body: string): {html: string; blocks: AnalysisReportBlock[]} {
    const lines = body.replace(/\r\n/g, '\n').split('\n')
    const parts: string[] = []
    const blocks: AnalysisReportBlock[] = []
    let index = 0
    let htmlBuffer = ''
    let htmlBudget = ANALYSIS_REPORT_MAX_SECTION_HTML_CHARS
    let budgetExhausted = false

    const flushHtml = () => {
        if (!htmlBuffer) return
        blocks.push({type: 'html', html: htmlBuffer})
        htmlBuffer = ''
    }

    const pushHtml = (chunk: string) => {
        if (!chunk || budgetExhausted) return
        if (chunk.length > htmlBudget) {
            const clipped = `${chunk.slice(0, Math.max(0, htmlBudget))}…`
            if (clipped) {
                parts.push(clipped)
                htmlBuffer += clipped
            }
            budgetExhausted = true
            flushHtml()
            blocks.push({
                type: 'html',
                html: '<p class="report-paragraph">… (section truncated for performance)</p>',
            })
            parts.push('<p class="report-paragraph">… (section truncated for performance)</p>')
            htmlBudget = 0
            return
        }
        parts.push(chunk)
        htmlBuffer += chunk
        htmlBudget -= chunk.length
    }

    while (index < lines.length) {
        if (budgetExhausted) break
        const line = lines[index]

        if (line.startsWith('```')) {
            const lang = line.slice(3).trim()
            const codeLines: string[] = []
            index += 1
            while (index < lines.length && !lines[index].startsWith('```')) {
                codeLines.push(lines[index])
                index += 1
            }
            if (index < lines.length) index += 1
            const clamped = clampCode(codeLines.join('\n'))
            flushHtml()
            blocks.push({type: 'code', lang, code: clamped.code})
            parts.push(codeBlockHtml(lang, clamped.code))
            continue
        }

        if (line.trim().startsWith('|') && index + 1 < lines.length && lines[index + 1].includes('---')) {
            const tableLines: string[] = [line, lines[index + 1]]
            index += 2
            while (index < lines.length && lines[index].trim().startsWith('|')) {
                tableLines.push(lines[index])
                index += 1
            }
            pushHtml(renderTableBlock(tableLines))
            continue
        }

        if (/^[-*]\s+/.test(line.trim())) {
            const items: string[] = []
            while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
                items.push(lines[index].trim().replace(/^[-*]\s+/, ''))
                index += 1
                if (items.length >= 200) break
            }
            // Skip remaining list items past the cap without parsing them into HTML.
            while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
                index += 1
            }
            pushHtml(
                `<ul class="report-list">${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`,
            )
            continue
        }

        if (!line.trim()) {
            index += 1
            continue
        }

        const paragraphLines: string[] = []
        while (
            index < lines.length &&
            lines[index].trim() &&
            !lines[index].startsWith('```') &&
            !lines[index].trim().startsWith('|') &&
            !/^[-*]\s+/.test(lines[index].trim())
        ) {
            paragraphLines.push(lines[index].trim())
            index += 1
            // Avoid joining a pathological single-line dump into one giant paragraph.
            if (paragraphLines.join(' ').length >= 8_000) break
        }
        pushHtml(`<p class="report-paragraph">${renderInlineMarkdown(paragraphLines.join(' '))}</p>`)
    }

    flushHtml()
    return {html: parts.join(''), blocks}
}

/**
 * Cheap header metadata — no HTML / code rendering.
 * Only scans a small prefix so Agent open stays light even with bloated history.
 */
export function parseAnalysisReportMeta(markdown: string | null | undefined): AnalysisReportMeta {
    const raw = (markdown ?? '').replace(/\r\n/g, '\n').trim()
    if (!raw) {
        return {title: '', excerpt: '', sectionCount: 0, truncated: false}
    }
    const truncated = raw.length > ANALYSIS_REPORT_MAX_MARKDOWN_CHARS
    // Header UI only needs title / excerpt / approx section count.
    const scanLimit = 32_000
    const scan = raw.length > scanLimit ? raw.slice(0, scanLimit) : raw
    const lines = scan.split('\n')
    let title = ''
    let startIndex = 0
    if (lines[0]?.startsWith('# ')) {
        title = lines[0].slice(2).trim()
        startIndex = 1
    }

    let sectionCount = 0
    let summaryBody: string[] = []
    let inSummary = false
    let collectedBody: string[] = []
    let summaryChars = 0
    let collectedChars = 0

    for (let i = startIndex; i < lines.length; i += 1) {
        const line = lines[i]
        if (line.startsWith('## ')) {
            sectionCount += 1
            inSummary = /^summary$/i.test(line.slice(3).trim())
            continue
        }
        if (inSummary) {
            if (summaryChars < 2_000) {
                summaryBody.push(line)
                summaryChars += line.length + 1
            }
        } else if (sectionCount === 0 && collectedChars < 2_000) {
            collectedBody.push(line)
            collectedChars += line.length + 1
        }
    }

    // Heading-less reports still count as one section for the badge.
    if (sectionCount === 0 && (title || scan)) sectionCount = 1

    const excerptSource = summaryBody.length ? summaryBody.join('\n') : collectedBody.join('\n') || scan
    return {
        title: title || 'Analysis Report',
        excerpt: plainExcerpt(excerptSource),
        sectionCount,
        truncated,
    }
}

export function parseAnalysisReport(markdown: string): ParsedAnalysisReport {
    try {
        const clamped = clampMarkdown((markdown ?? '').replace(/\r\n/g, '\n').trim())
        const normalized = clamped.text
        if (!normalized) {
            return {title: '', sections: [], excerpt: '', truncated: false}
        }

        const lines = normalized.split('\n')
        let title = ''
        let startIndex = 0
        if (lines[0]?.startsWith('# ')) {
            title = lines[0].slice(2).trim()
            startIndex = 1
        }

        const sections: AnalysisReportSection[] = []
        let currentTitle = ''
        let currentBody: string[] = []
        let currentBodyChars = 0

        const flush = () => {
            const body = currentBody.join('\n').trim()
            if (!currentTitle && !body) return
            const rendered = renderSectionBody(body)
            sections.push({
                title: currentTitle || title || 'Report',
                html: rendered.html,
                blocks: rendered.blocks,
            })
            currentTitle = ''
            currentBody = []
            currentBodyChars = 0
        }

        for (let i = startIndex; i < lines.length; i += 1) {
            const line = lines[i]
            if (line.startsWith('## ')) {
                flush()
                currentTitle = line.slice(3).trim()
                continue
            }
            // Soft-cap section body accumulation before render.
            if (currentBodyChars >= ANALYSIS_REPORT_MAX_SECTION_HTML_CHARS) {
                if (currentBody[currentBody.length - 1] !== '…') currentBody.push('…')
                continue
            }
            currentBody.push(line)
            currentBodyChars += line.length + 1
        }
        flush()

        const meta = parseAnalysisReportMeta(normalized)
        return {
            title: title || meta.title || 'Analysis Report',
            sections,
            excerpt: meta.excerpt,
            truncated: clamped.truncated || meta.truncated,
        }
    } catch {
        // RangeError / OOM path — never crash the Agent page.
        return {
            title: 'Analysis Report',
            sections: [{
                title: 'Report',
                html: '<p class="report-paragraph">Report too large to render.</p>',
                blocks: [{type: 'html', html: '<p class="report-paragraph">Report too large to render.</p>'}],
            }],
            excerpt: 'Report too large to render.',
            truncated: true,
        }
    }
}
