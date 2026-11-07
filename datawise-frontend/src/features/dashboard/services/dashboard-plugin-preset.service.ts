import {
    countPluginsConflictingWithPreset,
    findPluginPreset,
    type PluginPresetId,
} from '@/features/plugin/services/plugin-preset.service'

/** 当前开关相对对照预设的冲突插件数（仅统计预设 enable/disable 触及项） */
export function countReferencePresetConflicts(
    referencePresetId: PluginPresetId,
    isEnabled: (id: string) => boolean,
): number {
    const preset = findPluginPreset(referencePresetId)
    if (!preset) return 0
    return countPluginsConflictingWithPreset(preset, isEnabled)
}
