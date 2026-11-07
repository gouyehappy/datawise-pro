import {computed, ref, watch} from 'vue'
import type {TreeNode, WorkspaceTab} from '@/core/types'
import {findDatabaseLabel} from '@/core/utils/tree'
import type {SchemaTablesResult} from '@/shared/api/types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {tableDetailApi} from '@/api'

const EMPTY_SCHEMA: SchemaTablesResult = {
    database: '',
    tables: [],
}

function resolveDatabaseName(tab: WorkspaceTab, tree: TreeNode[]): string | undefined {
    if (tab.database?.trim()) return tab.database.trim()
    if (tab.instanceId) {
        return findDatabaseLabel(tree, tab.instanceId) ?? undefined
    }
    return undefined
}

export function useSchemaTables(
    tab: WorkspaceTab,
    options?: { shouldLoad?: () => boolean },
) {
    const explorer = useExplorerStore()
    const schema = ref<SchemaTablesResult>(EMPTY_SCHEMA)
    const loading = ref(false)
    const error = ref<string | null>(null)

    const databaseName = computed(() => resolveDatabaseName(tab, explorer.tree))
    const rows = computed(() => schema.value.tables)

    async function loadSchemaTables() {
        if (options?.shouldLoad && !options.shouldLoad()) return
        error.value = null
        if (!tab.connectionId) {
            schema.value = EMPTY_SCHEMA
            return
        }

        loading.value = true
        try {
            schema.value = await tableDetailApi.fetchSchemaTables({
                connectionId: tab.connectionId,
                database: databaseName.value,
            })
        } catch (loadError) {
            schema.value = EMPTY_SCHEMA
            error.value = loadError instanceof Error ? loadError.message : 'Failed to load schema tables'
        } finally {
            loading.value = false
        }
    }

    watch(
        () =>
            [
                tab.connectionId,
                tab.instanceId,
                tab.database,
                databaseName.value,
                explorer.treeReady,
            ] as const,
        () => {
            void loadSchemaTables()
        },
        {immediate: true, deep: true},
    )

    return {
        schema,
        rows,
        loading,
        error,
        databaseName,
        loadSchemaTables,
    }
}
