import {aiApi} from '@/api'
import type {AiTableTagCatalogItem} from '@/features/ai/tag/types/ai-table-tag.types'

export async function fetchAiTableTags(connectionId: string, database?: string): Promise<string[]> {
    return aiApi.fetchAiTableTags(connectionId, database)
}

export async function fetchAiTableTagCatalog(): Promise<AiTableTagCatalogItem[]> {
    return aiApi.fetchAiTableTagCatalog()
}

export async function updateAiTableTags(
    connectionId: string,
    database: string,
    tableNames: string[],
    tagged: boolean,
): Promise<string[]> {
    return aiApi.updateAiTableTags({connectionId, database, tableNames, tagged})
}
