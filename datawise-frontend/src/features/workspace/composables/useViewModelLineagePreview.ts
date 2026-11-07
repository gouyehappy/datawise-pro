import {ref, watch, type Ref} from 'vue'
import {useDebouncedRef} from '@/core/utils/debounced-ref'
import {lineageApi} from '@/api/modules/lineage'
import type {LineageGraph} from '@/features/lineage/types/lineage.types'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'

const DEBOUNCE_MS = 800

export interface ViewModelLineagePreviewScope {
    connectionId: Ref<string>
    instanceName: Ref<string | null>
    modelName: Ref<string>
    dbType: Ref<string | undefined>
    enabled: Ref<boolean>
}

export function useViewModelLineagePreview(sql: Ref<string>, scope: ViewModelLineagePreviewScope) {
    const graph = ref<LineageGraph | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)
    const debouncedSql = useDebouncedRef(sql, DEBOUNCE_MS)
    const entitlement = useEntitlementStore()
    let requestId = 0

    async function parseNow() {
        const connectionId = scope.connectionId.value
        const instanceName = scope.instanceName.value
        const sqlText = debouncedSql.value.trim()
        if (!scope.enabled.value || !connectionId || !instanceName || !sqlText) {
            graph.value = null
            error.value = null
            loading.value = false
            return
        }
        if (!entitlement.isPackUsable('pack.lineage')) {
            graph.value = null
            error.value = null
            loading.value = false
            return
        }
        const current = ++requestId
        loading.value = true
        error.value = null
        try {
            graph.value = await lineageApi.parse({
                connectionId,
                instanceName,
                name: scope.modelName.value,
                sql: sqlText,
                dbType: scope.dbType.value,
            })
        } catch (ex) {
            if (current === requestId) {
                error.value = ex instanceof Error ? ex.message : String(ex)
                graph.value = null
            }
        } finally {
            if (current === requestId) {
                loading.value = false
            }
        }
    }

    watch(
        [debouncedSql, () => scope.connectionId.value, () => scope.instanceName.value, () => scope.enabled.value],
        () => {
            void parseNow()
        },
        {immediate: true},
    )

    return {
        graph,
        loading,
        error,
        refresh: parseNow,
    }
}
