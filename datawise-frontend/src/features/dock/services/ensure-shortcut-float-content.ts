import type {ShortcutPanel} from '@/core/types'
import {SHORTCUT_RAIL_NAV_DEFS} from '@/features/layout/constants/shortcut-rail'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'

/**
 * When the shortcut rail enters float, open a tool window so the float host
 * is not an empty card with only a thin stripe.
 *
 * Safe during app-config bootstrap: may run before the store finishes setup
 * (circular useAppConfigStore → applyLayout → ensure → useAppConfigStore).
 */
export function ensureShortcutFloatContent(
    layout = useLayoutStore(),
    appConfig = useAppConfigStore(),
) {
    if (layout.showNotificationDrawer || layout.activeShortcutPanel) return

    const prefs = appConfig.preferences
    if (!prefs || typeof appConfig.isShortcutVisible !== 'function') return

    const last = prefs.lastShortcutPanel as ShortcutPanel | null | undefined
    if (last && appConfig.isShortcutVisible(last)) {
        layout.activeShortcutPanel = last
        return
    }

    const first = SHORTCUT_RAIL_NAV_DEFS.find((item) => appConfig.isShortcutVisible(item.id))
    if (first) layout.activeShortcutPanel = first.id
}
