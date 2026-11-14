import type {NavModule, PluginItem, SavedConsole, SettingsSection, SqlLogEntry} from '@/core/types'
import {
    listFeaturePaletteContributions,
    type FeaturePaletteAction,
    type FeaturePaletteContribution,
    type FeaturePaletteWhen,
} from '@/core/feature-contract'
import {paletteNavigationEntryAllowed} from '@/features/auth/services/feature-permission.service'
import type {FeaturePermissionKey} from '@/features/auth/types/feature-permission.types'
import {mergeQueryBookmarks} from '@/features/workspace/services/query-bookmark.service'
import {readStoredSharedSqlEditorShortcuts} from '@/features/settings/services/sql-editor-shortcuts.service'
import {
    buildPluginPaletteCommands,
    buildPluginPaletteStaticCommands,
    shouldShowPluginPaletteCommands,
} from '@/features/layout/services/palette-plugin.service'
import {
    buildPluginPaletteAlignReferenceCommand,
    buildPluginPaletteOpenPresetDiffCommand,
    buildPluginPalettePresetCommands,
    buildPluginPaletteReferencePresetCommands,
} from '@/features/layout/services/palette-plugin-preset.service'
import {SETTINGS_PLUGIN_REFERENCE_PRESET_ANCHOR} from '@/features/plugin/services/plugin-navigation.service'
import type {PluginPresetId} from '@/features/plugin/services/plugin-preset.service'

function isPaletteWhenMet(when: FeaturePaletteWhen | undefined, params: BuildPaletteNavigationParams): boolean {
    if (!when) return true
    if (when === 'pluginDevVisible') return params.isPluginDevToolsVisible()
    if (when === 'nonStandardEdition') return import.meta.env.VITE_DATAWISE_EDITION !== 'standard'
    return true
}

function runFeaturePaletteAction(action: FeaturePaletteAction, params: BuildPaletteNavigationParams): void {
    switch (action.kind) {
        case 'setModule':
            params.setModule(action.module)
            return
        case 'openConnectorMarket':
            params.openConnectorMarket()
            return
        case 'openPluginDevTools':
            params.openPluginDevTools()
            return
        case 'openDataCatalog':
            params.setModule('database')
            params.openDataCatalog()
            return
        case 'askAi':
            params.askAi()
            return
        case 'openSettings':
            params.openSettingsModule(action.section, action.anchor)
            return
        default: {
            const _exhaustive: never = action
            void _exhaustive
        }
    }
}

function featurePaletteEntry(
    contrib: FeaturePaletteContribution,
    params: BuildPaletteNavigationParams,
): PaletteNavigationEntry {
    return {
        id: contrib.id,
        label: params.t(contrib.labelKey),
        hint: contrib.hintKey ? params.t(contrib.hintKey) : undefined,
        group: params.t(contrib.groupKey),
        run: () => runFeaturePaletteAction(contrib.action, params),
    }
}

export interface PaletteNavigationEntry {
    id: string
    label: string
    hint?: string
    group: string
    run: () => void
}

export interface BuildPaletteNavigationParams {
    query: string
    t: (key: string, params?: Record<string, unknown>) => string
    te: (key: string) => boolean
    setModule: (module: NavModule) => void
    openConsole: (options?: {connectionName?: string; sql?: string}) => void
    toggleShortcutPanel: (panel: 'console') => void
    openPluginDevTools: () => void
    openConnectorMarket: () => void
    openDataCatalog: () => void
    /** 全局 AI 入口：切到 AI 模块并把焦点放进输入框 */
    askAi: () => void
    openSettingsModule: (section: SettingsSection, anchor?: string) => void
    isPluginDevToolsVisible: () => boolean
    bookmarksEnabled: boolean
    sqlHistoryEnabled: boolean
    sqlLogs: SqlLogEntry[]
    savedConsoles: SavedConsole[]
    plugins: PluginItem[]
    referencePresetId: PluginPresetId
    referencePresetConflictCount: number
    isPluginEnabled: (id: string) => boolean
    focusPlugin: (id: string) => void
    setPluginEnabled: (id: string, enabled: boolean) => void
    applyPreset: (presetId: PluginPresetId) => void
    setReferencePresetId: (presetId: PluginPresetId) => void
    alignToReferencePreset: () => void
    openPluginPresetDiff: () => void
    getReferencePresetId: () => PluginPresetId | null
    canAccessFeature: (key: FeaturePermissionKey) => boolean
    canAccessNavModule: (module: NavModule) => boolean
}

export function searchPaletteNavigationEntries(
    entries: PaletteNavigationEntry[],
    query: string,
): PaletteNavigationEntry[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter(
        (item) =>
            item.label.toLowerCase().includes(needle)
            || item.id.toLowerCase().includes(needle)
            || item.hint?.toLowerCase().includes(needle)
            || item.group.toLowerCase().includes(needle),
    )
}

export function buildPaletteNavigationEntries(params: BuildPaletteNavigationParams): PaletteNavigationEntry[] {
    const list: PaletteNavigationEntry[] = []
    const {t, te} = params

    // Nav modules come from Feature Contract palette contributions (A-15).
    const existingIds = new Set<string>()
    for (const contrib of listFeaturePaletteContributions()) {
        if (!isPaletteWhenMet(contrib.when, params)) continue
        if (existingIds.has(contrib.id)) continue
        list.push(featurePaletteEntry(contrib, params))
        existingIds.add(contrib.id)
    }

    list.push({
        id: 'action:new-console',
        label: t('commandPalette.actions.newConsole'),
        group: t('commandPalette.groups.actions'),
        run: () => {
            params.setModule('database')
            params.openConsole()
        },
    })

    list.push({
        id: 'action:data-catalog',
        label: t('commandPalette.actions.openDataCatalog'),
        group: t('commandPalette.groups.actions'),
        run: () => {
            params.setModule('database')
            params.openDataCatalog()
        },
    })

    if (params.bookmarksEnabled) {
        list.push({
            id: 'action:bookmarks',
            label: t('commandPalette.actions.openBookmarks'),
            group: t('commandPalette.groups.actions'),
            run: () => {
                params.setModule('database')
                params.toggleShortcutPanel('console')
            },
        })
    }

    if (params.sqlHistoryEnabled) {
        for (const log of params.sqlLogs.slice(0, 8)) {
            list.push({
                id: `sql:${log.id}`,
                label: log.sql.trim().slice(0, 80),
                hint: log.time,
                group: t('commandPalette.groups.recentSql'),
                run: () => {
                    params.setModule('database')
                    params.openConsole({sql: log.sql})
                },
            })
        }
    }

    if (params.bookmarksEnabled) {
        for (const bookmark of mergeQueryBookmarks(
            params.savedConsoles,
            readStoredSharedSqlEditorShortcuts().snippets ?? [],
        ).slice(0, 10)) {
            list.push({
                id: `bookmark:${bookmark.id}`,
                label: bookmark.name,
                hint: bookmark.folder,
                group: t('commandPalette.groups.bookmarks'),
                run: () => {
                    params.setModule('database')
                    params.openConsole({
                        connectionName: bookmark.connectionName && bookmark.connectionName !== '—'
                            ? bookmark.connectionName
                            : undefined,
                        sql: bookmark.sql,
                    })
                },
            })
        }
    }

    list.push({
        id: 'action:pack-store',
        label: t('commandPalette.actions.openPackStore'),
        group: t('commandPalette.groups.plugins'),
        run: () => params.setModule('packStore'),
    })

    list.push({
        id: 'action:plugin-center',
        label: t('commandPalette.actions.openPluginCenter'),
        group: t('commandPalette.groups.plugins'),
        run: () => params.setModule('plugin'),
    })

    list.push({
        id: 'action:connector-market',
        label: t('commandPalette.actions.openConnectorMarket'),
        group: t('commandPalette.groups.plugins'),
        run: () => params.openConnectorMarket(),
    })

    if (params.isPluginDevToolsVisible()) {
        list.push({
            id: 'action:plugin-dev-tools',
            label: t('commandPalette.actions.openPluginDevTools'),
            group: t('commandPalette.groups.plugins'),
            run: () => params.openPluginDevTools(),
        })
    }

    list.push(
        ...buildPluginPaletteStaticCommands({
            group: t('commandPalette.groups.plugins'),
            pluginSettingsLabel: t('commandPalette.actions.openPluginSettings'),
            openPluginSettings: () =>
                params.openSettingsModule('plugins', SETTINGS_PLUGIN_REFERENCE_PRESET_ANCHOR),
        }),
        ...buildPluginPalettePresetCommands({
            group: t('commandPalette.groups.presets'),
            presetLabel: (presetId: PluginPresetId) =>
                t('commandPalette.presets.apply', {preset: t(`plugin.presets.${presetId}.label`)}),
            presetHint: (presetId: PluginPresetId) =>
                params.getReferencePresetId() === presetId
                    ? t('commandPalette.presets.reference')
                    : '',
            applyPreset: (presetId) => params.applyPreset(presetId),
        }, {isEnabled: params.isPluginEnabled}),
        ...buildPluginPaletteReferencePresetCommands({
            group: t('commandPalette.groups.referencePresets'),
            referenceLabel: (presetId: PluginPresetId) =>
                t('commandPalette.presets.setReference', {preset: t(`plugin.presets.${presetId}.label`)}),
            referenceHint: (presetId: PluginPresetId) =>
                params.getReferencePresetId() === presetId
                    ? t('commandPalette.presets.reference')
                    : '',
            setReferencePreset: (presetId) => params.setReferencePresetId(presetId),
        }),
        buildPluginPaletteAlignReferenceCommand({
            group: t('commandPalette.groups.referencePresets'),
            label: t('commandPalette.presets.alignReference'),
            hint: (() => {
                const preset = t(`plugin.presets.${params.referencePresetId}.label`)
                if (params.referencePresetConflictCount > 0) {
                    return t('commandPalette.presets.alignReferenceNamed', {
                        preset,
                        count: params.referencePresetConflictCount,
                    })
                }
                return t('commandPalette.presets.alignReferenceSyncedNamed', {preset})
            })(),
            alignToReferencePreset: () => params.alignToReferencePreset(),
        }),
        buildPluginPaletteOpenPresetDiffCommand({
            group: t('commandPalette.groups.referencePresets'),
            label: t('commandPalette.presets.openPresetDiff'),
            hint: params.referencePresetConflictCount > 0
                ? t('commandPalette.presets.openPresetDiffHint', {count: params.referencePresetConflictCount})
                : undefined,
            openPresetDiff: () => params.openPluginPresetDiff(),
        }),
    )

    if (shouldShowPluginPaletteCommands(params.query)) {
        list.push(
            ...buildPluginPaletteCommands(params.plugins, {
                group: t('commandPalette.groups.plugins'),
                nameOf: (plugin) => {
                    const nameKey = `plugin.items.${plugin.id}.name`
                    return te(nameKey) ? t(nameKey) : plugin.name
                },
                enabledText: t('plugin.enabled'),
                disabledText: t('plugin.disabled'),
                focusLabel: (name) => t('commandPalette.plugins.focus', {name}),
                enableLabel: (name) => t('commandPalette.plugins.enable', {name}),
                disableLabel: (name) => t('commandPalette.plugins.disable', {name}),
                focusPlugin: (id) => params.focusPlugin(id),
                setEnabled: (id, enabled) => params.setPluginEnabled(id, enabled),
            }),
        )
    }

    return list.filter((entry) =>
        paletteNavigationEntryAllowed(entry.id, params.canAccessFeature, params.canAccessNavModule),
    )
}
