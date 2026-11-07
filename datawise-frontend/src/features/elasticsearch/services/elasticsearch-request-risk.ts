/** Read/write classification for Elasticsearch REST requests. Mirrors backend ElasticsearchRequestRisk. */

export type ElasticsearchRequestRisk = 'read' | 'write' | 'dangerous'

const REQUEST_LINE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/i
const READ_ONLY_POST = ['_search', '_count', '_sql', '_msearch', '_field_caps', '_terms_enum', '_validate', '_explain', '_rank_eval', '_search_shards']
const WRITE_POST = ['_doc', '_create', '_update', '_bulk']
const RISK_ORDER: Record<ElasticsearchRequestRisk, number> = {read: 0, write: 1, dangerous: 2}

export function classifyElasticsearchRequestRisk(request: string): ElasticsearchRequestRisk | null {
    const line = request.split(/\r?\n/).map((item) => item.trim()).find((item) => item && !item.startsWith('#') && !item.startsWith('//'))
    if (!line) return null
    const match = line.match(REQUEST_LINE)
    if (!match) return null
    const method = match[1].toUpperCase()
    const path = (match[2].split('?', 1)[0] ?? '').replace(/\/+$/, '')
    const segments = path.split('/').filter(Boolean)
    const has = (name: string) => segments.some((segment) => segment.toLowerCase() === name)
    const hasId = (marker: string) => {
        const index = segments.findIndex((segment) => segment.toLowerCase() === marker)
        return index >= 0 && Boolean(segments[index + 1])
    }
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'read'
    if (method === 'POST') {
        if (READ_ONLY_POST.some(has)) return 'read'
        return WRITE_POST.some(has) ? 'write' : 'dangerous'
    }
    if (method === 'PUT' && (hasId('_doc') || hasId('_create'))) return 'write'
    if (method === 'DELETE' && hasId('_doc')) return 'write'
    return 'dangerous'
}

export function classifyElasticsearchSourceRisk(source: string): ElasticsearchRequestRisk | null {
    const first = classifyElasticsearchRequestRisk(source)
    if (!first) return null
    let highest = first
    for (const line of source.split(/\r?\n/)) {
        const risk = classifyElasticsearchRequestRisk(line)
        if (risk && RISK_ORDER[risk] > RISK_ORDER[highest]) highest = risk
    }
    return highest
}
