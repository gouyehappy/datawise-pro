import {aiApi} from '@/api'
import type {AiKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'
import {normalizeKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'

export async function fetchAiKnowledgeEntries(): Promise<AiKnowledgeEntry[]> {
    return aiApi.fetchKnowledgeEntries()
}

export async function saveAiKnowledgeEntries(entries: AiKnowledgeEntry[]): Promise<AiKnowledgeEntry[]> {
    const normalized = entries
        .map((entry) => normalizeKnowledgeEntry(entry))
        .filter((entry): entry is AiKnowledgeEntry => entry != null)
    return aiApi.saveKnowledgeEntries(normalized)
}
