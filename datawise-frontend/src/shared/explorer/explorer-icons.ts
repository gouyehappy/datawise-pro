/** 资源管理器工具栏图标（DwIcon 语义名） */
import type {DwIconName} from '@/core/icons'

export const EXPLORER_ICONS = {
    add: 'plus',
    refresh: 'refresh',
    locate: 'locate',
    settings: 'settings',
    search: 'search',
    menuGroup: 'menu-group',
    menuConnection: 'menu-connection',
    menuImport: 'menu-import',
    menuArrow: 'chevron-right',
} as const satisfies Record<string, DwIconName>
