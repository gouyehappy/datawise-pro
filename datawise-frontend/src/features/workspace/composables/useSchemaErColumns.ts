import {computed, ref, watch, type ComputedRef, type Ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import type {SchemaRelationsResult, TableColumnDetail} from '@/shared/api/types'
import {tableDetailApi} from '@/api'
import type {TableRelationGraph} from '@/features/workspace/services/table-relation-graph.service'
import {enrichSchemaErGraphWithColumns} from '@/features/workspace/services/schema-relation-graph-columns.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

const BATCH_SIZE = 6

async function mapInBatches<T, R>(
    items: T[],
    batchSize: number,
    mapper: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = []
    for (let index = 0; index < items.length; index += batchSize) {
        const batch = items.slice(index, index + batchSize)
        const batchResults = await Promise.all(batch.map(mapper))
        results.push(...batchResults)
    }
    return results
}

export function useSchemaErColumns(
    tab: WorkspaceTab,
    graph: ComputedRef<TableRelationGraph>,
    schema: Ref<SchemaRelationsResult> | ComputedRef<SchemaRelationsResult>,
    databaseName: ComputedRef<string | undefined>,
) {
    const columnsByTable = ref<Map<string, TableColumnDetail[]>>(new Map())
    const commentsByTable = ref<Map<string, string>>(new Map())
    const loadingColumns = ref(false)
    const columnsError = ref<string | null>(null)
    let loadGeneration = 0

    async function reloadColumns() {
        const connectionId = tab.connectionId
        const generation = ++loadGeneration
        columnsError.value = null
        if (!connectionId || !graph.value.nodes.length) {
            columnsByTable.value = new Map()
            commentsByTable.value = new Map()
            return
        }

        loadingColumns.value = true
        try {
            const entries = await mapInBatches(
                graph.value.nodes,
                BATCH_SIZE,
                async (node) => {
                    try {
                        const properties = await tableDetailApi.fetchProperties(node.tableName, {
                            connectionId,
                            database: databaseName.value,
                        })
                        return {
                            tableName: node.tableName,
                            columns: properties.columns,
                            comment: properties.comment?.trim() || '',
                        }
                    } catch {
                        return {
                            tableName: node.tableName,
                            columns: [] as TableColumnDetail[],
                            comment: '',
                        }
                    }
                },
            )
            if (generation !== loadGeneration) return
            columnsByTable.value = new Map(entries.map((entry) => [entry.tableName, entry.columns]))
            commentsByTable.value = new Map(
                entries
                    .filter((entry) => entry.comment)
                    .map((entry) => [entry.tableName, entry.comment]),
            )
        } catch (error) {
            if (generation !== loadGeneration) return
            columnsError.value = resolveCaughtApiErrorMessage(error, t, 'workspace.metadoc.loadFailed')
        } finally {
            if (generation === loadGeneration) {
                loadingColumns.value = false
            }
        }
    }

    watch(
        () => [graph.value.nodes.map((node) => node.tableName).join('\0'), tab.connectionId, databaseName.value] as const,
        () => {
            void reloadColumns()
        },
        {immediate: true},
    )

    const enrichedGraph = computed(() =>
        enrichSchemaErGraphWithColumns(
            graph.value,
            schema.value,
            columnsByTable.value,
            commentsByTable.value,
        ),
    )

    return {
        enrichedGraph,
        columnsByTable,
        loadingColumns,
        columnsError,
        reloadColumns,
    }
}
