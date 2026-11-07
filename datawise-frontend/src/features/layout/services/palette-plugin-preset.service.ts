import {
    findPluginPreset,
    PLUGIN_PRESET_IDS,
    summarizePresetImpact,
    type PluginPresetId,
} from '@/features/plugin/services/plugin-preset.service'
import type {PluginPaletteCommand} from '@/features/layout/services/palette-plugin.service'

export interface PluginPalettePresetCommandHandlers {
    group: string
    presetLabel: (presetId: PluginPresetId) => string
    presetHint?: (presetId: PluginPresetId) => string
    applyPreset: (presetId: PluginPresetId) => void
}

export interface PluginPaletteReferencePresetHandlers {
    group: string
    referenceLabel: (presetId: PluginPresetId) => string
    referenceHint?: (presetId: PluginPresetId) => string
    setReferencePreset: (presetId: PluginPresetId) => void
}

/** 命令面板：设为对照预设（不改动开关，仅更新 referencePresetId） */
export function buildPluginPaletteReferencePresetCommands(
    handlers: PluginPaletteReferencePresetHandlers,
): PluginPaletteCommand[] {
    return PLUGIN_PRESET_IDS.map((presetId) => {
        const hint = handlers.referenceHint?.(presetId)?.trim()
        return {
            id: `plugin:reference-preset:${presetId}`,
            label: handlers.referenceLabel(presetId),
            hint: hint || undefined,
            group: handlers.group,
            run: () => handlers.setReferencePreset(presetId),
        }
    })
}

export function buildPluginPaletteAlignReferenceCommand(
    handlers: {
        group: string
        label: string
        hint?: string
        alignToReferencePreset: () => void
    },
): PluginPaletteCommand {
    return {
        id: 'plugin:align-reference-preset',
        label: handlers.label,
        hint: handlers.hint,
        group: handlers.group,
        run: handlers.alignToReferencePreset,
    }
}

export function buildPluginPaletteOpenPresetDiffCommand(
    handlers: {
        group: string
        label: string
        hint?: string
        openPresetDiff: () => void
    },
): PluginPaletteCommand {
    return {
        id: 'plugin:open-preset-diff',
        label: handlers.label,
        hint: handlers.hint,
        group: handlers.group,
        run: handlers.openPresetDiff,
    }
}

/** 命令面板：静态插件预设应用命令（无需搜索词） */
export function buildPluginPalettePresetCommands(
    handlers: PluginPalettePresetCommandHandlers,
    options?: {
        isEnabled?: (id: string) => boolean
    },
): PluginPaletteCommand[] {
    const isEnabled = options?.isEnabled ?? (() => false)

    return PLUGIN_PRESET_IDS.map((presetId) => {
        const preset = findPluginPreset(presetId)
        const parts: string[] = []
        if (preset) {
            const impact = summarizePresetImpact(preset, isEnabled)
            if (impact.totalChanges > 0) {
                parts.push(`+${impact.toEnable.length} / -${impact.toDisable.length}`)
            }
        }
        const customHint = handlers.presetHint?.(presetId)?.trim()
        if (customHint) parts.push(customHint)
        return {
            id: `plugin:preset:${presetId}`,
            label: handlers.presetLabel(presetId),
            hint: parts.length > 0 ? parts.join(' · ') : undefined,
            group: handlers.group,
            run: () => handlers.applyPreset(presetId),
        }
    })
}
