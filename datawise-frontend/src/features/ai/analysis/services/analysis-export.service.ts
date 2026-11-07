import type {AiAnalysisResult} from '@/features/ai/types/analysis'
import {parseAnalysisReport} from '@/features/ai/analysis/services/analysis-report-markdown.service'
import {downloadTextFile} from '@/shared/utils/download-text'

export {downloadTextFile, downloadTextFilesSequentially} from '@/shared/utils/download-text'

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function markdownTable(columns: { name: string; key?: string }[], rows: Record<string, unknown>[], limit = 50) {
    if (!columns.length || !rows.length) return ''
    const keys = columns.map((column) => column.key ?? column.name)
    const header = `| ${columns.map((column) => column.name).join(' | ')} |`
    const divider = `| ${columns.map(() => '---').join(' | ')} |`
    const body = rows
        .slice(0, limit)
        .map((row) => `| ${keys.map((key) => String(row[key] ?? '')).join(' | ')} |`)
        .join('\n')
    const suffix =
        rows.length > limit ? `\n\n> Showing first ${limit} of ${rows.length} rows.` : ''
    return `${header}\n${divider}\n${body}${suffix}`
}

export function buildAnalysisMarkdownExport(
    analysis: AiAnalysisResult,
    options?: { title?: string; generatedAt?: Date },
): string {
    const title = options?.title?.trim() || 'Analysis Report'
    const timestamp = (options?.generatedAt ?? new Date()).toISOString()
    const sections: string[] = [`# ${title}`, '', `_Generated at ${timestamp}_`, '']

    if (analysis.sql?.trim()) {
        sections.push('## SQL', '', '```sql', analysis.sql.trim(), '```', '')
    }

    if (analysis.pythonInsight?.trim()) {
        sections.push('## Python Insight', '', analysis.pythonInsight.trim(), '')
    }

    if (analysis.chart) {
        sections.push(
            '## Chart',
            '',
            `- Type: ${analysis.chart.type}`,
            `- Title: ${analysis.chart.title || '—'}`,
            `- X field: ${analysis.chart.xField}`,
            `- Y fields: ${analysis.chart.yFields.join(', ')}`,
            '',
        )
    }

    if (analysis.report?.markdown?.trim()) {
        sections.push('## Report', '', analysis.report.markdown.trim(), '')
    } else if (analysis.rows.length) {
        sections.push('## Data Preview', '', markdownTable(analysis.columns, analysis.rows), '')
    }

    return sections.join('\n').trim() + '\n'
}

export function buildAnalysisHtmlExport(
    analysis: AiAnalysisResult,
    options?: { title?: string; generatedAt?: Date },
): string {
    const title = options?.title?.trim() || 'Analysis Report'
    const timestamp = (options?.generatedAt ?? new Date()).toISOString()
    const parts: string[] = [
        '<!DOCTYPE html>',
        '<html lang="en"><head>',
        '<meta charset="utf-8"/>',
        `<title>${escapeHtml(title)}</title>`,
        '<style>body{font-family:system-ui,sans-serif;line-height:1.55;padding:24px;color:#111}pre{background:#f4f4f5;padding:12px;border-radius:8px;overflow:auto}section{margin-bottom:24px}h1,h2{margin:0 0 12px}</style>',
        '</head><body>',
        `<h1>${escapeHtml(title)}</h1>`,
        `<p><em>Generated at ${escapeHtml(timestamp)}</em></p>`,
    ]

    if (analysis.sql?.trim()) {
        parts.push('<section><h2>SQL</h2>', `<pre><code>${escapeHtml(analysis.sql.trim())}</code></pre></section>`)
    }

    if (analysis.pythonInsight?.trim()) {
        parts.push(
            '<section><h2>Python Insight</h2>',
            `<pre>${escapeHtml(analysis.pythonInsight.trim())}</pre></section>`,
        )
    }

    if (analysis.report?.markdown?.trim()) {
        const parsed = parseAnalysisReport(analysis.report.markdown)
        parts.push('<section><h2>Report</h2>')
        for (const section of parsed.sections) {
            parts.push(`<h3>${escapeHtml(section.title)}</h3>`, section.html)
        }
        parts.push('</section>')
    } else if (analysis.rows.length) {
        const tableMd = markdownTable(analysis.columns, analysis.rows)
        parts.push('<section><h2>Data Preview</h2>', `<pre>${escapeHtml(tableMd)}</pre></section>`)
    }

    parts.push('</body></html>')
    return parts.join('\n')
}

export function exportAnalysisMarkdown(analysis: AiAnalysisResult, filename = 'analysis-report.md') {
    downloadTextFile(buildAnalysisMarkdownExport(analysis), filename, 'text/markdown;charset=utf-8')
}

export function exportAnalysisHtml(analysis: AiAnalysisResult, filename = 'analysis-report.html') {
    downloadTextFile(buildAnalysisHtmlExport(analysis), filename, 'text/html;charset=utf-8')
}
