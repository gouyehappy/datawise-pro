import type {ShortcutPanel} from '@/core/types'

export interface ShortcutRailNavDef {
    id: ShortcutPanel
    labelKey: string
    /** Short rail label under icon — i18n key under shortcut.short.* */
    captionKey: string
}

export const SHORTCUT_RAIL_NAV_DEFS: ShortcutRailNavDef[] = [
    {id: 'info', labelKey: 'shortcut.objectInfo', captionKey: 'shortcut.short.info'},
    {id: 'history', labelKey: 'shortcut.sqlLog', captionKey: 'shortcut.short.history'},
    {id: 'monitor', labelKey: 'shortcut.monitor.title', captionKey: 'shortcut.short.monitor'},
    {id: 'console', labelKey: 'shortcut.savedConsole', captionKey: 'shortcut.short.console'},
    {id: 'migration', labelKey: 'shortcut.migration.title', captionKey: 'shortcut.short.migration'},
    {id: 'export', labelKey: 'shortcut.exportProgress', captionKey: 'shortcut.short.export'},
]
