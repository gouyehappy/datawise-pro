import type {LayoutPreferences, RestorableNavModule} from '@/shared/config/app-config.types'
import type {SideRailItemId} from '@/shared/config/side-rail.types'
import {SIDE_RAIL_NAV_DEFS} from '@/shared/config/side-rail-nav'

export const HOME_NAV_MODULE: RestorableNavModule = 'database'

export function resolveHomeNavModule(module: RestorableNavModule): RestorableNavModule {
    return module === 'dashboard' ? HOME_NAV_MODULE : module
}

export function isSideRailItemVisible(prefs: LayoutPreferences, id: SideRailItemId): boolean {
    return prefs.sideRailVisibility[id] !== false
}

export function pickAccessibleNavModule(
    prefs: LayoutPreferences,
    isModuleAccessible: (id: SideRailItemId) => boolean,
): RestorableNavModule {
    const accessible = SIDE_RAIL_NAV_DEFS.filter(
        (item) =>
            item.section === 'main'
            && isSideRailItemVisible(prefs, item.id)
            && isModuleAccessible(item.id),
    )
    if (accessible.length === 0) {
        return HOME_NAV_MODULE
    }

    const restored = resolveHomeNavModule(prefs.lastModule as RestorableNavModule)
    if (accessible.some((item) => item.id === restored)) {
        return restored
    }

    if (accessible.some((item) => item.id === HOME_NAV_MODULE)) {
        return HOME_NAV_MODULE
    }

    return accessible[0]!.id as RestorableNavModule
}
