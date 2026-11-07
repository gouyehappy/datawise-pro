/** Pretty-print Kibana-console REST request bodies. */

const REQUEST_LINE = /^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(\S+)/i

export function formatElasticsearchRestRequest(text: string, indentSize = 2): string | null {
    const trimmed = text.trim()
    if (!trimmed) return null
    const lines = trimmed.split(/\r?\n/)
    const first = lines[0]?.trim() ?? ''
    const match = first.match(REQUEST_LINE)
    if (!match) return null
    const method = match[1].toUpperCase()
    const rawPath = match[2]
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
    const body = lines.slice(1).join('\n').trim()
    if (!body) return `${method} ${path}`
    try {
        const pretty = JSON.stringify(JSON.parse(body), null, indentSize)
        return `${method} ${path}\n${pretty}`
    } catch {
        return null
    }
}
