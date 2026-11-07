import type {AiKnowledgeEntry} from '@/shared/api/ai.types'

export type {AiKnowledgeEntry}

export function createEmptyKnowledgeEntry(id: string): AiKnowledgeEntry {
    return {
        id,
        term: '',
        definition: '',
        synonyms: [],
        relatedTables: [],
    }
}

export function normalizeKnowledgeEntry(raw: Partial<AiKnowledgeEntry>): AiKnowledgeEntry | null {
    const term = raw.term?.trim()
    const definition = raw.definition?.trim()
    if (!term || !definition) return null
    return {
        id: raw.id?.trim() || `kb-${Date.now()}`,
        connectionId: raw.connectionId?.trim() || undefined,
        database: raw.database?.trim() || undefined,
        term,
        definition,
        synonyms: (raw.synonyms ?? []).map((item) => item.trim()).filter(Boolean),
        relatedTables: (raw.relatedTables ?? []).map((item) => item.trim()).filter(Boolean),
    }
}

export function parseCommaList(value: string): string[] {
    return value
        .split(/[,，;；]/)
        .map((item) => item.trim())
        .filter(Boolean)
}

export function formatCommaList(items: string[]): string {
    return items.join(', ')
}
