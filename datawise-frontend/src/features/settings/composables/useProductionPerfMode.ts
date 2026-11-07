import {computed, type MaybeRefOrGetter, toValue} from 'vue'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {isProductionPerfActive} from '@/features/settings/services/production-perf-mode.service'

/** 当前连接是否处于「生产环境性能模式」收紧策略下 */
export function useProductionPerfMode(connectionId: MaybeRefOrGetter<string | undefined>) {
    const explorer = useExplorerStore()
    const productionPerfActive = computed(() =>
        isProductionPerfActive(toValue(connectionId), explorer.findNode),
    )
    return {productionPerfActive}
}
