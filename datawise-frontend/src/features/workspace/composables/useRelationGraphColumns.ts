import {computed, ref, watch, type ComputedRef, type Ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import type {TableColumnDetail, TableRelationsResult} from '@/shared/api/types'
import {tableDetailApi} from '@/api'
import type {TableRelationGraph} from '@/features/workspace/services/table-relation-graph.service'
import {enrichRelationGraphWithColumns} from '@/features/workspace/services/table-relation-graph-columns.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

export function useRelationGraphColumns(
    tab: WorkspaceTab,
    graph: ComputedRef<TableRelationGraph>,
    relations: Ref<TableRelationsResult>,
    databaseName: ComputedRef<string | undefined>,
) {
    const columnsByTable = ref<Map<string, TableColumnDetail[]>>(new Map())
    const loadingColumns = ref(false)
    const columnsError = ref<string | null>(null)

    watch(
        () => [graph.value.nodes.map((node) => node.tableName).join('\0'), tab.connectionId, databaseName.value] as const,
        async ([, connectionId]) => {
            columnsError.value = null
            columnsByTable.value = new Map()
            if (!connectionId || !graph.value.nodes.length) return

            loadingColumns.value = true
            try {
                const entries: Array<[string, TableColumnDetail[]]> = []
                for (const node of graph.value.nodes) {
                    try {
                        const properties = await tableDetailApi.fetchProperties(node.tableName, {
                            connectionId,
                            database: databaseName.value,
                        })
                        entries.push([node.tableName, properties.columns])
                    } catch {
                        entries.push([node.tableName, []])
                    }
                }
                columnsByTable.value = new Map(entries)
            } catch (error) {
                columnsError.value = resolveCaughtApiErrorMessage(error, t, 'workspace.metadoc.loadFailed')
            } finally {
                loadingColumns.value = false
            }
        },
        {immediate: true},
    )

    const enrichedGraph = computed(() =>
        enrichRelationGraphWithColumns(graph.value, relations.value, columnsByTable.value),
    )

    return {
        enrichedGraph,
        loadingColumns,
        columnsError,
    }
}
