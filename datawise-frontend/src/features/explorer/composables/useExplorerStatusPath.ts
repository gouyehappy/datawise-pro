import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {storeToRefs} from 'pinia'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {findAncestorByType, resolveConnectionId} from '@/core/utils/tree'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {
    buildExplorerStatusPath,
    formatConnectionEndpointLabel,
} from '@/features/explorer/services/explorer-status-path.service'

export function useExplorerStatusPath() {
    const {t} = useI18n()
    const explorer = useExplorerStore()
    const {tree, selectedNodeId} = storeToRefs(explorer)
    const endpointByConnectionId = ref<Map<string, string>>(new Map())

    const activeConnectionId = computed(() => {
        if (!selectedNodeId.value) return null
        return resolveConnectionId(tree.value, selectedNodeId.value)
    })

    watch(
        activeConnectionId,
        async (connectionId) => {
            if (!connectionId || endpointByConnectionId.value.has(connectionId)) return
            const node = findAncestorByType(tree.value, connectionId, 'connection')
            if (node?.label) {
                const next = new Map(endpointByConnectionId.value)
                next.set(connectionId, node.label)
                endpointByConnectionId.value = next
            }
            try {
                const config = await fetchConnectionConfig(connectionId)
                if (!config) return
                const endpoint = formatConnectionEndpointLabel(config)
                if (!endpoint) return
                const next = new Map(endpointByConnectionId.value)
                next.set(connectionId, endpoint)
                endpointByConnectionId.value = next
            } catch {
                // keep tree label fallback
            }
        },
        {immediate: true},
    )

    const segments = computed(() =>
        buildExplorerStatusPath(
            tree.value,
            selectedNodeId.value,
            t,
            endpointByConnectionId.value,
        ),
    )

    return {
        segments,
        hasPath: computed(() => segments.value.length > 0),
    }
}
