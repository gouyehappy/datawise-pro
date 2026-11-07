import type {SqlLogEntry} from '@/core/types'
import type {AiKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'
import {
    fetchAiKnowledgeEntries,
    saveAiKnowledgeEntries,
} from '@/features/ai/knowledge/services/ai-knowledge.service'
import {
    buildKnowledgeEntryFromSqlLog,
    type SqlLogArchiveContext,
} from '@/features/workspace/services/sql-history-knowledge.utils'

export type {SqlLogArchiveContext} from '@/features/workspace/services/sql-history-knowledge.utils'
export {
    buildKnowledgeDefinition,
    buildKnowledgeEntryFromSqlLog,
    buildKnowledgeTerm,
    buildTeamQueryPayloadFromSqlLog,
    extractTableNamesFromSql,
} from '@/features/workspace/services/sql-history-knowledge.utils'

export async function appendSqlLogToPersonalKnowledge(
    log: SqlLogEntry,
    context: SqlLogArchiveContext,
): Promise<AiKnowledgeEntry> {
    const entry = buildKnowledgeEntryFromSqlLog(log, context)
    if (!entry) {
        throw new Error('SQL is empty')
    }
    const existing = await fetchAiKnowledgeEntries()
    const index = existing.findIndex((item) => item.id === entry.id)
    const next = [...existing]
    if (index >= 0) {
        next[index] = entry
    } else {
        next.push(entry)
    }
    await saveAiKnowledgeEntries(next)
    return entry
}
