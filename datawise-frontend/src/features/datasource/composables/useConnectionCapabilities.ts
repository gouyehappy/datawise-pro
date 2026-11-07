/**
 * 按 dbType 解析连接能力快照，供 UI disabled / tooltip 使用。
 * 依赖 datasource catalog（启动后 ensureLoaded）；未加载时回退静态矩阵。
 */
import {computed, onMounted, unref, type MaybeRef} from 'vue'
import {useI18n} from 'vue-i18n'
import type {DbType} from '@/core/types'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {
    buildConnectionCapabilities,
    type ConnectionCapabilitiesSnapshot,
} from '@/shared/capabilities/db-type-capabilities'
import {
    CAPABILITY_HINT_I18N,
    type CapabilityHintKey,
} from '@/shared/capabilities/capability-keys'

export function useConnectionCapabilities(dbType: MaybeRef<DbType | undefined>) {
    const catalogStore = useDatasourceCatalogStore()
    const {t} = useI18n()

    onMounted(() => {
        void catalogStore.ensureLoaded().catch(() => undefined)
    })

    const caps = computed<ConnectionCapabilitiesSnapshot>(() =>
        buildConnectionCapabilities(unref(dbType), catalogStore.items),
    )

    function hint(key: CapabilityHintKey): string {
        return t(CAPABILITY_HINT_I18N[key])
    }

    return {
        caps,
        hint,
    }
}
