import type {PluginPreferences} from '@/shared/config/app-config.types'

/** 应用配置导入时合并 plugins：enabled 以导入为准；referencePresetId 导入缺省时保留当前值 */
export function mergePluginsOnAppConfigImport(
    current: PluginPreferences | undefined,
    imported: PluginPreferences | undefined,
): PluginPreferences {
    const curEnabled = current?.enabled ?? {}
    if (!imported) {
        const merged: PluginPreferences = {enabled: {...curEnabled}}
        if (current?.referencePresetId) merged.referencePresetId = current.referencePresetId
        return merged
    }

    const merged: PluginPreferences = {enabled: {...imported.enabled}}
    const referencePresetId = imported.referencePresetId ?? current?.referencePresetId
    if (referencePresetId) merged.referencePresetId = referencePresetId
    return merged
}
