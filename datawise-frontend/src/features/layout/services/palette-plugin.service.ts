import type {PluginItem} from '@/core/types'
import {comparePluginUsageIds} from '@/features/plugin/services/plugin-usage.service'

export interface PluginPaletteCommand {
    id: string
    label: string
    hint?: string
    group: string
    run: () => void
}

export interface PluginPaletteCommandHandlers {
    group: string
    nameOf: (plugin: PluginItem) => string
    enabledText: string
    disabledText: string
    focusLabel: (name: string) => string
    enableLabel: (name: string) => string
    disableLabel: (name: string) => string
    focusPlugin: (id: string) => void
    setEnabled: (id: string, enabled: boolean) => void
    openPluginSettings?: () => void
    pluginSettingsLabel?: string
}

/** 命令面板：有搜索词时才展开各插件的聚焦/开关命令，避免默认列表过长 */
export function shouldShowPluginPaletteCommands(query: string): boolean {
    return query.trim().length > 0
}

/** 命令面板插件命令：按本地切换频率与最近切换时间排序 */
export function sortPluginsForCommandPalette(plugins: PluginItem[]): PluginItem[] {
    return [...plugins].sort(
        (a, b) => comparePluginUsageIds(a.id, b.id) || a.name.localeCompare(b.name),
    )
}

/** 命令面板静态插件命令（无需搜索词） */
export function buildPluginPaletteStaticCommands(
    handlers: Pick<PluginPaletteCommandHandlers, 'group' | 'openPluginSettings' | 'pluginSettingsLabel'>,
): PluginPaletteCommand[] {
    if (!handlers.openPluginSettings || !handlers.pluginSettingsLabel) return []
    return [{
        id: 'plugin:open-settings',
        label: handlers.pluginSettingsLabel,
        group: handlers.group,
        run: handlers.openPluginSettings,
    }]
}

export function buildPluginPaletteCommands(
    plugins: PluginItem[],
    handlers: PluginPaletteCommandHandlers,
): PluginPaletteCommand[] {
    const list: PluginPaletteCommand[] = []
    for (const plugin of sortPluginsForCommandPalette(plugins)) {
        const name = handlers.nameOf(plugin)
        list.push({
            id: `plugin:focus:${plugin.id}`,
            label: handlers.focusLabel(name),
            hint: `${plugin.id} · ${plugin.enabled ? handlers.enabledText : handlers.disabledText}`,
            group: handlers.group,
            run: () => handlers.focusPlugin(plugin.id),
        })
        if (plugin.enabled) {
            list.push({
                id: `plugin:toggle-off:${plugin.id}`,
                label: handlers.disableLabel(name),
                hint: plugin.id,
                group: handlers.group,
                run: () => handlers.setEnabled(plugin.id, false),
            })
        } else {
            list.push({
                id: `plugin:toggle-on:${plugin.id}`,
                label: handlers.enableLabel(name),
                hint: plugin.id,
                group: handlers.group,
                run: () => handlers.setEnabled(plugin.id, true),
            })
        }
    }
    return list
}
