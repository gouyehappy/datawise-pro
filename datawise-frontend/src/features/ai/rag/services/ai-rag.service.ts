import {aiApi} from '@/api'

export type {AiRagStatus, AiRagRebuildResult} from '@/shared/api/types'

export async function fetchAiRagStatus(connectionId?: string, database?: string) {
    return aiApi.fetchRagStatus(connectionId, database)
}

export async function rebuildAiRagIndex(connectionId?: string, database?: string) {
    return aiApi.rebuildRagIndex(connectionId, database)
}
