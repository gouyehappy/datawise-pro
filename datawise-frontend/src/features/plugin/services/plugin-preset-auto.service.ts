import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    readUserResourceJson,
    writeUserResourceJson,
} from '@/features/auth/services/user-scoped-storage.service'
import {
    hasPluginEnabledOverrides,
    suggestPresetForTeamRole,
    type PluginPresetId,
} from '@/features/plugin/services/plugin-preset.service'

const STORAGE_KEY = 'datawise-plugin-auto-presets'

function normalizePresetList(raw: unknown): PluginPresetId[] | null {
    if (!Array.isArray(raw)) return null
    return raw.filter(
        (value): value is PluginPresetId =>
            value === 'dba'
            || value === 'readOnlyAnalysis'
            || value === 'teamViewer'
            || value === 'developer'
            || value === 'minimal',
    )
}

export function readAutoAppliedPresets(): PluginPresetId[] {
    return (
        readUserResourceJson(UserResource.AppConfig, STORAGE_KEY, normalizePresetList) ?? []
    )
}

export function markPresetAutoApplied(id: PluginPresetId): void {
    const applied = new Set(readAutoAppliedPresets())
    applied.add(id)
    writeUserResourceJson(UserResource.AppConfig, STORAGE_KEY, [...applied])
}

/** 无本地覆盖且未自动应用过时，按团队角色返回应自动应用的预设 */
export function resolveFirstVisitAutoPreset(
    role: string | null | undefined,
    overrides: Record<string, boolean | undefined>,
): PluginPresetId | null {
    if (hasPluginEnabledOverrides(overrides)) return null
    const suggested = suggestPresetForTeamRole(role)
    if (!suggested) return null
    if (readAutoAppliedPresets().includes(suggested)) return null
    return suggested
}
