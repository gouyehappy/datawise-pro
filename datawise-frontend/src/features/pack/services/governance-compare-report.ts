import type {SchemaCompareResult, SchemaScope, TableSchemaDiff} from '@/features/schema-compare/types/schema-compare.types'
import type {QueryResultDiffView} from '@/features/workspace/services/query-result-diff.service'
import {downloadTextFile} from '@/shared/utils/download-text'
import {openHtmlPrintDialog} from '@/shared/utils/print-html'

/** §1.2 — full compare report (HTML + browser Print→PDF) requires Governance. */

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function scopeLabel(scope: SchemaScope | null | undefined): string {
    if (!scope) return '—'
    return `${scope.connectionLabel} / ${scope.database}`
}

function stampFileName(prefix: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return `${prefix}-${stamp}.html`
}

const REPORT_STYLE = [
    'body{font-family:system-ui,Segoe UI,sans-serif;line-height:1.5;padding:24px;color:#111;max-width:1100px;margin:0 auto}',
    'h1,h2,h3{margin:0 0 12px}',
    'p,ul{margin:0 0 12px}',
    'table{border-collapse:collapse;width:100%;margin:0 0 20px;font-size:13px}',
    'th,td{border:1px solid #d4d4d8;padding:6px 8px;text-align:left;vertical-align:top}',
    'th{background:#f4f4f5}',
    'pre{background:#f4f4f5;padding:12px;border-radius:6px;overflow:auto;white-space:pre-wrap}',
    '.meta{color:#52525b;font-size:13px}',
    '.footer{margin-top:32px;padding-top:12px;border-top:1px solid #d4d4d8;color:#71717a;font-size:12px}',
    '.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#e4e4e7;font-size:12px;margin-right:6px}',
    '@media print{body{padding:0;max-width:none} .no-print{display:none!important}}',
].join('')

function wrapHtml(title: string, body: string[], watermarkFooter?: string | null): string {
    const parts = [
        '<!DOCTYPE html>',
        '<html lang="en"><head>',
        '<meta charset="utf-8"/>',
        `<title>${escapeHtml(title)}</title>`,
        `<style>${REPORT_STYLE}</style>`,
        '</head><body>',
        ...body,
    ]
    const mark = watermarkFooter?.trim()
    if (mark) {
        parts.push(`<footer class="footer">${escapeHtml(mark)}</footer>`)
    }
    parts.push('</body></html>')
    return parts.join('\n')
}

function conflictTables(tableDiffs: readonly TableSchemaDiff[]): TableSchemaDiff[] {
    return tableDiffs.filter((item) => item.status !== 'unchanged')
}

export function buildSchemaCompareReportHtml(options: {
    title?: string
    left: SchemaScope | null
    right: SchemaScope | null
    result: SchemaCompareResult
    /** Include selected/effective DDL when present. */
    ddl?: string | null
    generatedAt?: Date
    watermarkFooter?: string | null
}): string {
    const title = options.title?.trim() || 'Schema Compare Report'
    const timestamp = (options.generatedAt ?? new Date()).toISOString()
    const summary = options.result.summary
    const conflicts = conflictTables(options.result.tableDiffs)
    const body: string[] = [
        `<h1>${escapeHtml(title)}</h1>`,
        `<p class="meta"><em>Generated at ${escapeHtml(timestamp)}</em></p>`,
        '<p class="no-print meta">Tip: use Print → Save as PDF for a portable PDF copy.</p>',
        '<section><h2>Scopes</h2><ul>',
        `<li><strong>Reference:</strong> ${escapeHtml(scopeLabel(options.left))}</li>`,
        `<li><strong>Target:</strong> ${escapeHtml(scopeLabel(options.right))}</li>`,
        '</ul></section>',
        '<section><h2>Summary</h2>',
        `<span class="pill">Reference only ${summary.added}</span>`,
        `<span class="pill">Target only ${summary.removed}</span>`,
        `<span class="pill">Changed ${summary.changed}</span>`,
        `<span class="pill">Unchanged ${summary.unchanged}</span>`,
        `<p class="meta">${conflicts.length} conflict table(s)</p>`,
        '</section>',
        '<section><h2>Table differences</h2>',
    ]

    if (!conflicts.length) {
        body.push('<p>No structural differences.</p></section>')
    } else {
        for (const table of conflicts) {
            body.push(
                `<h3>${escapeHtml(table.tableName)} <span class="pill">${escapeHtml(table.status)}</span></h3>`,
            )
            if (!table.columnDiffs.length) {
                body.push('<p class="meta">No column-level diffs.</p>')
                continue
            }
            body.push(
                '<table><thead><tr><th>Column</th><th>Change</th><th>Reference</th><th>Target</th><th>Details</th></tr></thead><tbody>',
            )
            for (const column of table.columnDiffs) {
                body.push(
                    '<tr>',
                    `<td>${escapeHtml(column.name)}</td>`,
                    `<td>${escapeHtml(column.status)}</td>`,
                    `<td>${escapeHtml(column.left?.dataType ?? '—')}</td>`,
                    `<td>${escapeHtml(column.right?.dataType ?? '—')}</td>`,
                    `<td>${escapeHtml(column.changes.join('; ') || '—')}</td>`,
                    '</tr>',
                )
            }
            body.push('</tbody></table>')
        }
        body.push('</section>')
    }

    const ddl = options.ddl?.trim()
    if (ddl) {
        body.push(
            '<section><h2>Migration DDL</h2>',
            `<pre><code>${escapeHtml(ddl)}</code></pre></section>`,
        )
    }

    return wrapHtml(title, body, options.watermarkFooter)
}

export function buildCrossEnvCompareReportHtml(options: {
    title?: string
    left: SchemaScope | null
    right: SchemaScope | null
    sql?: string | null
    sampleRows?: number | null
    diff: QueryResultDiffView
    generatedAt?: Date
    watermarkFooter?: string | null
    /** Cap changed rows rendered in the report body (safety for large samples). */
    maxChangedRows?: number
}): string {
    const title = options.title?.trim() || 'Cross-env Compare Report'
    const timestamp = (options.generatedAt ?? new Date()).toISOString()
    const maxChanged = options.maxChangedRows ?? 2_000
    const summary = options.diff.summary
    const changedRows = options.diff.rows.filter((row) => row.rowStatus !== 'unchanged')
    const rendered = changedRows.slice(0, maxChanged)
    const columns = options.diff.columns

    const body: string[] = [
        `<h1>${escapeHtml(title)}</h1>`,
        `<p class="meta"><em>Generated at ${escapeHtml(timestamp)}</em></p>`,
        '<p class="no-print meta">Tip: use Print → Save as PDF for a portable PDF copy.</p>',
        '<section><h2>Scopes</h2><ul>',
        `<li><strong>Baseline:</strong> ${escapeHtml(scopeLabel(options.left))}</li>`,
        `<li><strong>Target:</strong> ${escapeHtml(scopeLabel(options.right))}</li>`,
        '</ul></section>',
    ]

    if (options.sql?.trim()) {
        body.push(
            '<section><h2>SQL</h2>',
            `<pre><code>${escapeHtml(options.sql.trim())}</code></pre>`,
            options.sampleRows != null
                ? `<p class="meta">Sample rows: ${options.sampleRows}</p>`
                : '',
            '</section>',
        )
    }

    body.push(
        '<section><h2>Summary</h2>',
        `<span class="pill">Unchanged ${summary.unchangedRows}</span>`,
        `<span class="pill">Modified ${summary.modifiedRows}</span>`,
        `<span class="pill">Added ${summary.addedRows}</span>`,
        `<span class="pill">Removed ${summary.removedRows}</span>`,
        `<span class="pill">Changed cells ${summary.changedCells}</span>`,
        '</section>',
        '<section><h2>Changed rows</h2>',
    )

    if (!changedRows.length) {
        body.push('<p>No row differences in the sample.</p></section>')
    } else {
        if (changedRows.length > maxChanged) {
            body.push(
                `<p class="meta">Showing first ${maxChanged} of ${changedRows.length} changed row(s).</p>`,
            )
        }
        body.push(
            '<table><thead><tr><th>Row</th><th>Status</th>',
            ...columns.map((col) => `<th>${escapeHtml(col.name)}</th>`),
            '</tr></thead><tbody>',
        )
        for (const row of rendered) {
            body.push(
                '<tr>',
                `<td>${escapeHtml(row.id)}</td>`,
                `<td>${escapeHtml(row.rowStatus)}</td>`,
            )
            for (const col of columns) {
                const cell = row.cells[col.name]
                const display = cell?.display ?? ''
                const prev = cell?.previous
                const text =
                    prev != null && prev !== display
                        ? `${prev} → ${display}`
                        : display
                body.push(`<td>${escapeHtml(text || '—')}</td>`)
            }
            body.push('</tr>')
        }
        body.push('</tbody></table></section>')
    }

    return wrapHtml(title, body, options.watermarkFooter)
}

export function exportSchemaCompareReport(options: {
    left: SchemaScope | null
    right: SchemaScope | null
    result: SchemaCompareResult
    ddl?: string | null
    title?: string
    watermarkFooter?: string | null
    fileName?: string
    /** When true (default), open browser print dialog for Save-as-PDF. */
    openPrintDialog?: boolean
}): {fileName: string; printOpened: boolean} {
    const html = buildSchemaCompareReportHtml(options)
    const fileName = options.fileName?.trim() || stampFileName('schema-compare-report')
    downloadTextFile(html, fileName, 'text/html;charset=utf-8')
    const printOpened =
        options.openPrintDialog === false ? false : openHtmlPrintDialog(html)
    return {fileName, printOpened}
}

export function exportCrossEnvCompareReport(options: {
    left: SchemaScope | null
    right: SchemaScope | null
    sql?: string | null
    sampleRows?: number | null
    diff: QueryResultDiffView
    title?: string
    watermarkFooter?: string | null
    fileName?: string
    openPrintDialog?: boolean
}): {fileName: string; printOpened: boolean} {
    const html = buildCrossEnvCompareReportHtml(options)
    const fileName = options.fileName?.trim() || stampFileName('cross-env-compare-report')
    downloadTextFile(html, fileName, 'text/html;charset=utf-8')
    const printOpened =
        options.openPrintDialog === false ? false : openHtmlPrintDialog(html)
    return {fileName, printOpened}
}
