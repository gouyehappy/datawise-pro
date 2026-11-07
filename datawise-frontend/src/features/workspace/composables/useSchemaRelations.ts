import {computed, ref, watch} from 'vue'
import type {TreeNode, WorkspaceTab} from '@/core/types'
import {findDatabaseLabel} from '@/core/utils/tree'
import type {SchemaRelationsResult} from '@/shared/api/types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {tableDetailApi} from '@/api'

const EMPTY_SCHEMA: SchemaRelationsResult = {
    database: '',
    tables: [],
    edges: [],
}

function resolveDatabaseName(tab: WorkspaceTab, tree: TreeNode[]): string | undefined {
    if (tab.database?.trim()) return tab.database.trim()
    if (tab.instanceId) {
        return findDatabaseLabel(tree, tab.instanceId) ?? undefined
    }
    return undefined
}

export function useSchemaRelations(
    tab: WorkspaceTab,
    options?: { shouldLoad?: () => boolean },
) {
    const explorer = useExplorerStore()
    const schema = ref<SchemaRelationsResult>(EMPTY_SCHEMA)
    const loading = ref(false)
    const error = ref<string | null>(null)

    const databaseName = computed(() => resolveDatabaseName(tab, explorer.tree))

    async function loadSchemaRelations() {
        if (options?.shouldLoad && !options.shouldLoad()) return
        error.value = null
        if (!tab.connectionId) {
            schema.value = EMPTY_SCHEMA
            return
        }
        loading.value = true
        try {
            schema.value = await tableDetailApi.fetchSchemaRelations({
                connectionId: tab.connectionId,
                database: databaseName.value,
            })
        } catch (loadError) {
            schema.value = EMPTY_SCHEMA
            error.value = loadError instanceof Error ? loadError.message : 'Failed to load schema relations'
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
            void loadSchemaRelations()
        },
        {immediate: true, deep: true},
    )

    return {
        schema,
        loading,
        error,
        databaseName,
        loadSchemaRelations,
    }
}
