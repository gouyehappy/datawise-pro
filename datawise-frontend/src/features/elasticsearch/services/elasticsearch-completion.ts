/** Lightweight Kibana-console style path completions for Elasticsearch REST. */
const STATIC_SUGGESTIONS = [
    'GET /_cat/indices',
    'GET /_cat/aliases',
    'GET /_cluster/health',
    'GET /_cluster/stats',
    'GET /_nodes',
    'GET /_alias',
    'GET /_mapping',
    'POST /_search\n{\n  "query": { "match_all": {} }\n}',
    'POST /_count\n{\n  "query": { "match_all": {} }\n}',
    'POST /_sql?format=json\n{\n  "query": "SHOW TABLES"\n}',
]

export function suggestElasticsearchRestCompletions(
    text: string,
    indexNames: string[] = [],
    limit = 12,
): string[] {
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    const current = (lines[lines.length - 1] ?? '').trim()
    const prefix = current.toLowerCase()
    const indexSuggestions = indexNames.flatMap((name) => [
        `GET /${name}/_mapping`,
        `GET /${name}/_settings`,
        `GET /${name}/_stats`,
        `POST /${name}/_search\n{\n  "query": { "match_all": {} }\n}`,
        `POST /${name}/_count\n{\n  "query": { "match_all": {} }\n}`,
    ])
    const pool = [...STATIC_SUGGESTIONS, ...indexSuggestions]
    if (!prefix) return pool.slice(0, limit)
    return pool
        .filter((item) => item.toLowerCase().includes(prefix) || item.toLowerCase().startsWith(prefix))
        .slice(0, limit)
}

export function applyElasticsearchRestCompletion(text: string, suggestion: string): string {
    const normalized = text.replace(/\r\n/g, '\n')
    const lastBreak = normalized.lastIndexOf('\n')
    if (lastBreak < 0) return suggestion
    return normalized.slice(0, lastBreak + 1) + suggestion
}
