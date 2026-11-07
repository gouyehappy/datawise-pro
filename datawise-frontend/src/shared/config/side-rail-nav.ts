import type {SideRailItemId} from '@/shared/config/side-rail.types'

export type {SideRailItemId}

export interface SideRailNavDef {
    id: SideRailItemId
    labelKey: string
    /** Short rail label under icon — i18n key under nav.caption.* */
    captionKey: string
    section: 'main' | 'util' | 'bottom'
}

export const SIDE_RAIL_NAV_DEFS: SideRailNavDef[] = [
    {id: 'database', labelKey: 'nav.database', captionKey: 'nav.caption.database', section: 'main'},
    {id: 'dashboard', labelKey: 'nav.dashboard', captionKey: 'nav.caption.dashboard', section: 'main'},
    {id: 'ai', labelKey: 'nav.ai', captionKey: 'nav.caption.ai', section: 'main'},
    {id: 'packStore', labelKey: 'nav.packStore', captionKey: 'nav.caption.packStore', section: 'main'},
    {id: 'plugin', labelKey: 'nav.plugin', captionKey: 'nav.caption.plugin', section: 'main'},
    {id: 'connectorMarket', labelKey: 'nav.connectorMarket', captionKey: 'nav.caption.connectorMarket', section: 'main'},
    {id: 'pluginDev', labelKey: 'nav.pluginDev', captionKey: 'nav.caption.pluginDev', section: 'main'},
    {id: 'refresh', labelKey: 'nav.refresh', captionKey: 'nav.caption.refresh', section: 'util'},
    {id: 'notify', labelKey: 'nav.notify', captionKey: 'nav.caption.notify', section: 'util'},
    {id: 'assistant', labelKey: 'nav.assistant', captionKey: 'nav.caption.assistant', section: 'util'},
    {id: 'feedback', labelKey: 'nav.feedback', captionKey: 'nav.caption.feedback', section: 'util'},
    {id: 'terminal', labelKey: 'shortcut.terminal', captionKey: 'nav.caption.terminal', section: 'bottom'},
]
