import type {NavModule, SettingsSection} from '@/core/types'
import type {TitleBarMenuIconId} from '@/features/layout/components/TitleBarMenuIcon.vue'
import {
    buildQuickConfigMenuChildren,
    type TitleBarQuickConfigHandlers,
    type TitleBarQuickConfigState,
} from '@/features/layout/services/title-bar-config-menu.service'
import {
    canAccessFeature,
    titleBarMenuChildFeatureKey,
    titleBarMenuFeatureKey,
} from '@/features/auth/services/feature-permission.service'

export type TitleBarMenuKind = 'nav' | 'action' | 'header'
export type TitleBarMenuMode = 'leaf' | 'dropdown'

export interface TitleBarMenuItem {
    id: string
    labelKey: string
    icon?: TitleBarMenuIconId
    menuMode?: TitleBarMenuMode
    kind?: TitleBarMenuKind
    hintKey?: string
    active?: boolean
    checked?: boolean
    badge?: number
    divider?: boolean
    /** Emphasize as a primary toolbar action (show label even when compact). */
    primary?: boolean
    run?: () => void
    children?: TitleBarMenuItem[]
}

export interface TitleBarNavHandlers {
    setModule: (module: NavModule) => void
    openSettings: (section?: SettingsSection) => void
    openOnboarding: () => void
    openRuntimeSetup: () => void
    openNewConnection: () => void
    openNewConsole: () => void
    config: TitleBarQuickConfigHandlers
}

export interface TitleBarNavContext {
    activeModule: NavModule
    settingsSection: SettingsSection
    config: TitleBarQuickConfigState
    /** True when the singleton community-plugin-center workspace tab is focused. */
    communityPluginCenterActive?: boolean
}

const HELP_SECTIONS: SettingsSection[] = ['about']

type LeafOptions = Pick<TitleBarMenuItem, 'active' | 'badge' | 'icon' | 'primary' | 'kind' | 'menuMode'>

function leaf(
    id: string,
    labelKey: string,
    run: () => void,
    options: LeafOptions = {},
): TitleBarMenuItem {
    return {id, labelKey, kind: options.kind ?? 'action', run, ...options}
}

function configMenu(ctx: TitleBarNavContext, handlers: TitleBarNavHandlers): TitleBarMenuItem {
    return {
        id: 'config',
        labelKey: 'app.titleBar.menu.config',
        icon: 'config',
        menuMode: 'dropdown',
        kind: 'nav',
        children: buildQuickConfigMenuChildren(ctx.config, handlers.config),
    }
}

/** 帮助菜单：导览、运行时组件、关于 */
function helpMenu(ctx: TitleBarNavContext, handlers: TitleBarNavHandlers): TitleBarMenuItem {
    return {
        id: 'help',
        labelKey: 'app.titleBar.menu.help',
        icon: 'help',
        menuMode: 'dropdown',
        kind: 'nav',
        active: ctx.activeModule === 'settings' && HELP_SECTIONS.includes(ctx.settingsSection),
        children: [
            leaf('help:onboarding', 'app.titleBar.menu.helpOnboarding', () => handlers.openOnboarding(), {
                icon: 'tour',
            }),
            leaf('help:runtime-setup', 'app.titleBar.menu.helpRuntimeSetup', () => handlers.openRuntimeSetup(), {
                icon: 'connectors',
            }),
            leaf('help:about', 'settings.nav.about', () => handlers.openSettings('about'), {
                active: ctx.activeModule === 'settings' && HELP_SECTIONS.includes(ctx.settingsSection),
                icon: 'about',
            }),
        ],
    }
}

function filterTitleBarMenuItem(item: TitleBarMenuItem): TitleBarMenuItem | null {
    const feature = titleBarMenuFeatureKey(item.id) ?? titleBarMenuChildFeatureKey(item.id)
    if (feature && !canAccessFeature(feature)) {
        return null
    }
    if (!item.children?.length) {
        return item
    }
    const children = item.children
        .map((child) => filterTitleBarMenuItem(child))
        .filter((child): child is TitleBarMenuItem => child != null)
    const actionable = children.filter((child) => !child.divider && child.kind !== 'header')
    if (actionable.length === 0) {
        return null
    }
    return {...item, children}
}

/**
 * 桌面顶栏（对标 DBX AppToolbar）：
 * 新建连接 / 新建控制台 / 连接器市场 / 社区插件 + 配置 / 帮助。
 * 其余模块切换仍由左侧 SideRail 承担。
 */
export function buildTitleBarNav(ctx: TitleBarNavContext, handlers: TitleBarNavHandlers): TitleBarMenuItem[] {
    return [
        leaf('new-connection', 'app.titleBar.menu.newConnection', () => handlers.openNewConnection(), {
            icon: 'database',
            primary: true,
            menuMode: 'dropdown',
        }),
        leaf('new-console', 'app.titleBar.menu.newConsole', () => handlers.openNewConsole(), {
            icon: 'console',
            primary: true,
        }),
        leaf('connectors', 'app.titleBar.menu.connectorMarket', () => handlers.setModule('connectorMarket'), {
            icon: 'connectors',
            active: ctx.activeModule === 'connectorMarket',
        }),
        leaf('community-plugins', 'app.titleBar.menu.communityPlugin', () => handlers.setModule('communityPlugin'), {
            icon: 'plugins',
            active: ctx.activeModule === 'communityPlugin' || Boolean(ctx.communityPluginCenterActive),
        }),
        configMenu(ctx, handlers),
        helpMenu(ctx, handlers),
    ]
        .map((item) => filterTitleBarMenuItem(item))
        .filter((item): item is TitleBarMenuItem => item != null)
}

export function titleBarMenuActionableChildren(item: TitleBarMenuItem): TitleBarMenuItem[] {
    return item.children?.filter((child) => !child.divider && child.kind !== 'header') ?? []
}

export function titleBarMenuIsDropdown(item: TitleBarMenuItem): boolean {
    return item.menuMode === 'dropdown' && (
        item.id === 'new-connection' || titleBarMenuActionableChildren(item).length > 0
    )
}

export function titleBarMenuHasChildren(item: TitleBarMenuItem): boolean {
    return titleBarMenuIsDropdown(item)
}
