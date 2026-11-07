import type {PluginId} from '@/features/plugin/services/plugin-registry.service'
import {isTeamViewer} from '@/features/team/services/team-role.service'

export type PluginPresetId = 'dba' | 'readOnlyAnalysis' | 'teamViewer' | 'developer' | 'minimal'

export const PLUGIN_PRESET_IDS: PluginPresetId[] = [
    'dba',
    'readOnlyAnalysis',
    'teamViewer',
    'developer',
    'minimal',
]

export function isPluginPresetId(value: unknown): value is PluginPresetId {
    return typeof value === 'string' && (PLUGIN_PRESET_IDS as string[]).includes(value)
}

/** 持久化或缺省时的对照预设（默认 minimal） */
export function normalizeReferencePresetId(value: unknown): PluginPresetId {
    return isPluginPresetId(value) ? value : 'minimal'
}

export interface PluginPresetDefinition {
    id: PluginPresetId
    enable: PluginId[]
    disable?: PluginId[]
}

/** 一键启用/关闭的插件组合（在现有覆盖之上合并） */
export const PLUGIN_PRESET_DEFINITIONS: PluginPresetDefinition[] = [
    {
        id: 'dba',
        enable: [
            'p-sql-monitor',
            'p-explain-plan',
            'p-sql-history',
            'p-schema-compare',
            'p-migration-tasks',
            'p-export-progress',
            'p-ai-index-suggest',
            'p-ai-sql-fix',
            'p-grid-edit',
        ],
        disable: ['p-fake-data'],
    },
    {
        id: 'readOnlyAnalysis',
        enable: [
            'p-grid-export',
            'p-export-mask',
            'p-explain-plan',
            'p-cross-env-compare',
            'p-result-diff',
            'p-sql-bookmarks',
            'p-schema-compare',
            'p-sql-history',
            'p-ai-result-summary',
            'p-ai-explain',
        ],
        disable: ['p-fake-data', 'p-migration-tasks', 'p-grid-edit', 'p-dml-generate'],
    },
    {
        id: 'teamViewer',
        enable: [
            'p-grid-export',
            'p-export-mask',
            'p-explain-plan',
            'p-cross-env-compare',
            'p-result-diff',
            'p-sql-bookmarks',
            'p-schema-compare',
            'p-sql-history',
            'p-ai-result-summary',
            'p-ai-explain',
        ],
        disable: [
            'p-fake-data',
            'p-migration-tasks',
            'p-grid-edit',
            'p-dml-generate',
            'p-ai-sql-fix',
            'p-table-codegen',
            'p-ai-index-suggest',
        ],
    },
    {
        id: 'developer',
        enable: [
            'p-ai-workbench',
            'p-console-ai',
            'p-sql-format',
            'p-sql-snippets',
            'p-sql-snippets-team',
            'p-sql-snippets-personal',
            'p-explain-plan',
            'p-result-diff',
            'p-fake-data',
            'p-table-codegen',
            'p-dml-generate',
            'p-grid-edit',
            'p-ai-sql-fix',
            'p-ai-index-suggest',
            'p-ai-result-summary',
            'p-ai-explain',
        ],
    },
    {
        id: 'minimal',
        enable: ['p-sql-format', 'p-grid-export'],
        disable: [
            'p-ai-workbench',
            'p-console-ai',
            'p-sql-monitor',
            'p-migration-tasks',
            'p-fake-data',
            'p-export-progress',
            'p-ai-index-suggest',
            'p-ai-sql-fix',
            'p-ai-result-summary',
            'p-ai-explain',
            'p-table-codegen',
            'p-dml-generate',
            'p-grid-edit',
        ],
    },
]

/** 按团队角色推荐预设（仅 UI 提示，不自动应用） */
export function suggestPresetForTeamRole(role: string | null | undefined): PluginPresetId | null {
    if (isTeamViewer(role)) return 'teamViewer'
    return null
}

export function findPluginPreset(id: PluginPresetId): PluginPresetDefinition | undefined {
    return PLUGIN_PRESET_DEFINITIONS.find((preset) => preset.id === id)
}

export function hasPluginEnabledOverrides(
    overrides: Record<string, boolean | undefined>,
): boolean {
    return Object.values(overrides).some((value) => typeof value === 'boolean')
}

export function buildPresetPluginOverrides(preset: PluginPresetDefinition): Record<string, boolean> {
    const overrides: Record<string, boolean> = {}
    for (const pluginId of preset.enable) overrides[pluginId] = true
    for (const pluginId of preset.disable ?? []) overrides[pluginId] = false
    return overrides
}

export function mergePresetIntoOverrides(
    current: Record<string, boolean | undefined>,
    preset: PluginPresetDefinition,
): Record<string, boolean> {
    const merged: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(current)) {
        if (typeof value === 'boolean') merged[key] = value
    }
    return {...merged, ...buildPresetPluginOverrides(preset)}
}

export interface PluginPresetChange {
    id: PluginId
    action: 'enable' | 'disable'
}

export interface PluginPresetImpactSummary {
    toEnable: PluginId[]
    toDisable: PluginId[]
    totalChanges: number
}

/** 相对当前开关状态，应用预设将会启/关的插件（不含已处于目标状态的项） */
export function summarizePresetImpact(
    preset: PluginPresetDefinition,
    isEnabled: (id: PluginId) => boolean,
): PluginPresetImpactSummary {
    const toEnable: PluginId[] = []
    const toDisable: PluginId[] = []
    for (const id of preset.enable) {
        if (!isEnabled(id)) toEnable.push(id)
    }
    for (const id of preset.disable ?? []) {
        if (isEnabled(id)) toDisable.push(id)
    }
    return {
        toEnable,
        toDisable,
        totalChanges: toEnable.length + toDisable.length,
    }
}

export function listPresetChanges(
    preset: PluginPresetDefinition,
    isEnabled: (id: PluginId) => boolean,
): PluginPresetChange[] {
    const impact = summarizePresetImpact(preset, isEnabled)
    return [
        ...impact.toEnable.map((id) => ({id, action: 'enable' as const})),
        ...impact.toDisable.map((id) => ({id, action: 'disable' as const})),
    ]
}

/** 预设对该插件的期望开关；未在 enable/disable 列表中则 undefined */
export function resolvePresetTargetState(
    preset: PluginPresetDefinition,
    id: PluginId,
): boolean | undefined {
    if (preset.enable.includes(id)) return true
    if (preset.disable?.includes(id)) return false
    return undefined
}

export function pluginConflictsWithPreset(
    id: PluginId,
    preset: PluginPresetDefinition,
    isEnabled: (id: PluginId) => boolean,
): boolean {
    const target = resolvePresetTargetState(preset, id)
    if (target === undefined) return false
    return isEnabled(id) !== target
}

export function countPluginsConflictingWithPreset(
    preset: PluginPresetDefinition,
    isEnabled: (id: PluginId) => boolean,
): number {
    const touched = new Set<PluginId>([...preset.enable, ...(preset.disable ?? [])])
    let count = 0
    for (const id of touched) {
        if (pluginConflictsWithPreset(id, preset, isEnabled)) count += 1
    }
    return count
}

export interface PresetMatchScore {
    id: PluginPresetId
    conflicts: number
    totalTouched: number
}

/** 按与当前开关冲突最少排序；同分则优先覆盖更多预设项的组合 */
export function recommendClosestPreset(
    isEnabled: (id: PluginId) => boolean,
): PresetMatchScore | null {
    let best: PresetMatchScore | null = null
    for (const preset of PLUGIN_PRESET_DEFINITIONS) {
        const conflicts = countPluginsConflictingWithPreset(preset, isEnabled)
        const totalTouched = preset.enable.length + (preset.disable?.length ?? 0)
        const candidate: PresetMatchScore = {id: preset.id, conflicts, totalTouched}
        if (
            !best
            || conflicts < best.conflicts
            || (conflicts === best.conflicts && totalTouched > best.totalTouched)
        ) {
            best = candidate
        }
    }
    return best
}

export function findBestMatchingPresetId(
    isEnabled: (id: PluginId) => boolean,
): PluginPresetId {
    return recommendClosestPreset(isEnabled)?.id ?? 'minimal'
}
