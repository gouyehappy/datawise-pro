import {computed} from 'vue'
import {storeToRefs} from 'pinia'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {countReferencePresetConflicts} from '@/features/dashboard/services/dashboard-plugin-preset.service'
import {
    normalizeReferencePresetId,
    type PluginPresetId,
} from '@/features/plugin/services/plugin-preset.service'

/** 对照预设 id 与冲突计数（直接订阅 app-config.plugins，供仪表盘/设置页等同步刷新） */
export function usePluginPresetSummary() {
    const appConfig = useAppConfigStore()
    const pluginStore = usePluginStore()
    const {config} = storeToRefs(appConfig)

    const referencePresetId = computed<PluginPresetId>(() =>
        normalizeReferencePresetId(config.value.plugins?.referencePresetId),
    )

    const referencePresetConflictCount = computed(() =>
        countReferencePresetConflicts(referencePresetId.value, (id) => pluginStore.isEnabled(id)),
    )

    return {
        referencePresetId,
        referencePresetConflictCount,
    }
}
