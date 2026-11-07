import {computed, ref, watch} from 'vue'
import type {TreeNode, WorkspaceTab} from '@/core/types'
import {findDatabaseLabel} from '@/core/utils/tree'
import type {TableRelationsResult} from '@/shared/api/types'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {tableDetailApi} from '@/api'

const EMPTY_RELATIONS: TableRelationsResult = {
    tableName: '',
    references: [],
    referencedBy: [],
}

function resolveDatabaseName(tab: WorkspaceTab, tree: TreeNode[]): string | undefined {
    if (tab.database?.trim()) return tab.database.trim()
    if (tab.instanceId) {
        return findDatabaseLabel(tree, tab.instanceId) ?? undefined
    }
    return undefined
}

export function useTableRelations(
    tab: WorkspaceTab,
    options?: { shouldLoad?: () => boolean },
) {
    const explorer = useExplorerStore()
    const relations = ref<TableRelationsResult>(EMPTY_RELATIONS)
    const loading = ref(false)
    const error = ref<string | null>(null)

    const databaseName = computed(() => resolveDatabaseName(tab, explorer.tree))

    async function loadRelations() {
        if (options?.shouldLoad && !options.shouldLoad()) return
        error.value = null
        if (!tab.tableName?.trim() || !tab.connectionId) {
            relations.value = EMPTY_RELATIONS
            return
        }
        loading.value = true
        try {
            relations.value = await tableDetailApi.fetchRelations(tab.tableName, {
                connectionId: tab.connectionId,
                database: databaseName.value,
            })
        } catch (loadError) {
            relations.value = EMPTY_RELATIONS
            error.value = loadError instanceof Error ? loadError.message : 'Failed to load table relations'
        } finally {
            loading.value = false
        }
    }

    watch(
        () =>
            [
                tab.tableName,
                tab.connectionId,
                tab.instanceId,
                tab.database,
                databaseName.value,
                explorer.treeReady,
            ] as const,
        () => {
            void loadRelations()
        },
        {immediate: true, deep: true},
    )

    return {
        relations,
        loading,
        error,
        databaseName,
        loadRelations,
    }
}
