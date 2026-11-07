import {computed, ref, watch, type Ref} from 'vue'
import type {PluginPresetId} from '@/features/plugin/services/plugin-preset.service'
import {
    clearReferenceConflictBannerDismiss,
    readReferenceConflictBannerDismiss,
    shouldShowReferenceConflictBanner,
    writeReferenceConflictBannerDismiss,
} from '@/features/plugin/services/plugin-ui-session.service'

/** 对照预设冲突 banner 的会话级 dismiss（插件页 / 仪表盘共用） */
export function useReferenceConflictBannerDismiss(
    referencePresetId: Ref<PluginPresetId>,
    conflictCount: Ref<number>,
) {
    const dismissed = ref(readReferenceConflictBannerDismiss())

    const visible = computed(() =>
        shouldShowReferenceConflictBanner(
            referencePresetId.value,
            conflictCount.value,
            dismissed.value,
        ),
    )

    function dismiss() {
        if (conflictCount.value <= 0) return
        dismissed.value = {
            presetId: referencePresetId.value,
            conflictCount: conflictCount.value,
        }
        writeReferenceConflictBannerDismiss(dismissed.value)
    }

    function refreshDismissState() {
        dismissed.value = readReferenceConflictBannerDismiss()
    }

    watch(conflictCount, (count) => {
        if (count === 0) {
            dismissed.value = null
            clearReferenceConflictBannerDismiss()
        }
    })

    return {
        visible,
        dismiss,
        refreshDismissState,
    }
}
