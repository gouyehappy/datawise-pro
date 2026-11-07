import type {AiKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'

export function isPaletteKnowledgeMode(query: string): boolean {
    return query.trimStart().startsWith('#')
}

export function paletteKnowledgeQuery(query: string): string {
    return query.trimStart().slice(1).trim()
}

function matchesKnowledgeEntry(entry: AiKnowledgeEntry, needle: string): boolean {
    if (entry.term.toLowerCase().includes(needle)) return true
    if (entry.definition.toLowerCase().includes(needle)) return true
    if (entry.synonyms.some((item) => item.toLowerCase().includes(needle))) return true
    if (entry.relatedTables.some((item) => item.toLowerCase().includes(needle))) return true
    if (entry.database?.toLowerCase().includes(needle)) return true
    return false
}

export function searchKnowledgeEntries(entries: AiKnowledgeEntry[], query: string): AiKnowledgeEntry[] {
    const effective = isPaletteKnowledgeMode(query) ? paletteKnowledgeQuery(query) : query.trim()
    if (!effective) {
        return isPaletteKnowledgeMode(query) ? entries.slice(0, 12) : []
    }
    const needle = effective.toLowerCase()
    return entries.filter((entry) => matchesKnowledgeEntry(entry, needle)).slice(0, 12)
}

/** 从知识库条目中提取可执行的 SQL 正文 */
export function extractSqlFromKnowledgeDefinition(definition: string): string {
    const trimmed = definition.trim()
    if (!trimmed) return ''

    const lines = trimmed.split('\n')
    const sqlLines: string[] = []
    for (const line of lines) {
        const text = line.trim()
        if (!text && sqlLines.length) break
        if (text.startsWith('--') && sqlLines.length) break
        sqlLines.push(line)
    }
    return sqlLines.join('\n').trim() || trimmed
}

export function knowledgeEntrySubtitle(entry: AiKnowledgeEntry): string {
    const parts: string[] = []
    if (entry.database) parts.push(entry.database)
    if (entry.relatedTables.length) parts.push(entry.relatedTables.slice(0, 2).join(', '))
    return parts.join(' · ')
}
