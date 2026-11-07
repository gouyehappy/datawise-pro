import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useLayoutStore} from '@/features/layout/stores/layout'
import type {AiKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'
import {extractSqlFromKnowledgeDefinition} from '@/features/layout/services/palette-knowledge.service'
import {t} from '@/i18n'

export async function activatePaletteKnowledgeEntry(entry: AiKnowledgeEntry): Promise<void> {
    const workspace = useWorkspaceStore()
    const layout = useLayoutStore()
    const sql = extractSqlFromKnowledgeDefinition(entry.definition)

    if (sql && /\b(select|insert|update|delete|with|create|alter|explain)\b/i.test(sql)) {
        await workspace.openConsole({
            connectionId: entry.connectionId,
            database: entry.database,
            sql,
            title: entry.term,
        })
        return
    }

    await navigator.clipboard.writeText(entry.definition)
    layout.showSuccessToast(t('globalObjectSearch.knowledgeCopied'))
}
