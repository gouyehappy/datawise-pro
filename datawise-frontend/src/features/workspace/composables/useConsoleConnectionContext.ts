import {computed, ref, watch} from 'vue'
import {storeToRefs} from 'pinia'
import type {WorkspaceTab} from '@/core/types'
import {findParentConnectionId} from '@/core/utils/tree'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {isCatalogSchemaDbType} from '@/features/explorer/services/explorer-lazy-load'
import {
    extractDataSources,
    findDataSource,
    filterConsoleCapableDataSources,
    filterSelectableDataSources,
    includePinnedDataSource,
    pickDefaultDataSource,
    resolveBoundInstanceId,
} from '@/features/explorer/utils/data-sources'
import {getBoundConsoleSqlFile} from '@/features/workspace/services/console-tab-title'

/** 控制台 Tab 的数据源 / 实例选择，与 explorer 树联动 */
export function useConsoleConnectionContext(tab: WorkspaceTab) {
    const explorer = useExplorerStore()
    const catalog = useDatasourceCatalogStore()
    const {connectionHealthById} = storeToRefs(explorer)

    const workspaceBound = computed(() => Boolean(getBoundConsoleSqlFile(tab)))

    const dataSources = computed(() => {
        void explorer.treeVersion
        return filterConsoleCapableDataSources(
            extractDataSources(explorer.tree),
            catalog.items,
        )
    })
    const selectableDataSources = computed(() =>
        filterSelectableDataSources(dataSources.value, connectionHealthById.value),
    )
    const connectionId = ref(tab.connectionId ?? '')
    const instanceId = ref<string | null>(tab.instanceId ?? null)

    const selected = explorer.selectedNode
    if (!workspaceBound.value) {
        if (selected?.type === 'connection' && !tab.connectionId) {
            connectionId.value = selected.id
        }
        if (selected?.type === 'database' && !tab.instanceId && !tab.database) {
            const parentConnectionId = findParentConnectionId(explorer.tree, selected.id)
            const connection = parentConnectionId ? explorer.findNode(parentConnectionId) : undefined
            if (parentConnectionId && !isCatalogSchemaDbType(connection?.dbType)) {
                connectionId.value = parentConnectionId
                instanceId.value = selected.id
            }
        }
    }

    const source = computed(() =>
        connectionId.value ? findDataSource(dataSources.value, connectionId.value) : undefined,
    )
    const activeInstance = computed(() =>
        source.value?.instances.find((item) => item.id === instanceId.value) ?? null,
    )

    const ctxDataSources = computed(() => {
        if (!workspaceBound.value) return selectableDataSources.value
        return includePinnedDataSource(
            dataSources.value,
            selectableDataSources.value,
            connectionHealthById.value,
            tab.connectionId || connectionId.value,
        )
    })

    watch(
        () => [explorer.treeVersion, connectionHealthById.value] as const,
        () => {
            if (workspaceBound.value) {
                const pinnedId = tab.connectionId || connectionId.value
                if (pinnedId) {
                    connectionId.value = pinnedId
                }
                const activeSource = connectionId.value
                    ? findDataSource(dataSources.value, connectionId.value)
                    : undefined
                if (isCatalogSchemaDbType(activeSource?.dbType)) {
                    return
                }
                const nextInstanceId = resolveBoundInstanceId({
                    instances: activeSource?.instances ?? [],
                    tabInstanceId: instanceId.value ?? tab.instanceId,
                    tabDatabase: tab.database || explorer.findNode(connectionId.value)?.database,
                    preserveBinding: true,
                })
                if (instanceId.value !== nextInstanceId) {
                    instanceId.value = nextInstanceId
                }
                return
            }

            const sources = selectableDataSources.value
            const preferredId = connectionId.value || tab.connectionId
            const currentStillValid =
                Boolean(preferredId && findDataSource(dataSources.value, preferredId))
            const next = currentStillValid && preferredId
                ? findDataSource(dataSources.value, preferredId)
                : pickDefaultDataSource(dataSources.value, connectionHealthById.value, preferredId)

            if (next) {
                if (connectionId.value !== next.id) {
                    connectionId.value = next.id
                }
            } else if (!sources.length) {
                if (connectionId.value !== '') {
                    connectionId.value = ''
                }
            }

            const activeSource = connectionId.value
                ? findDataSource(dataSources.value, connectionId.value)
                : undefined
            if (isCatalogSchemaDbType(activeSource?.dbType)) {
                return
            }
            const nextInstanceId = resolveBoundInstanceId({
                instances: activeSource?.instances ?? [],
                tabInstanceId: instanceId.value ?? tab.instanceId,
                tabDatabase: tab.database || explorer.findNode(connectionId.value)?.database,
                preserveBinding: workspaceBound.value,
            })
            if (instanceId.value !== nextInstanceId) {
                instanceId.value = nextInstanceId
            }
        },
        {immediate: true},
    )

    return {
        connectionId,
        instanceId,
        dataSources: ctxDataSources,
        source,
        activeInstance,
        workspaceBound,
    }
}
