import type {TitleBarMenuIconId} from '@/features/layout/components/TitleBarMenuIcon.vue'
import type {TitleBarMenuItem} from '@/features/layout/services/title-bar-nav.service'

export interface TitleBarQuickConfigState {
    showSideRailStrip: boolean
    showExplorerPanel: boolean
    showShortcutRailStrip: boolean
}

export interface TitleBarQuickConfigHandlers {
    openPreferences: () => void
    toggleSideRailStrip: () => void
    toggleExplorerPanel: () => void
    toggleShortcutRailStrip: () => void
    applyFocusMode: () => void
}

type ToggleOptions = {
    icon: TitleBarMenuIconId
    /** 固定文案（勾选=当前可见）；勿用「显示/隐藏」成对切换文案 */
    labelKey: string
}

function toggleItem(
    id: string,
    visible: boolean,
    run: () => void,
    options: ToggleOptions,
): TitleBarMenuItem {
    return {
        id,
        labelKey: options.labelKey,
        kind: 'action',
        checked: visible,
        icon: options.icon,
        run,
    }
}

function divider(id: string): TitleBarMenuItem {
    return {id, labelKey: '', divider: true}
}

/** 配置菜单：首选项 + 面板可见性（勾选=当前显示）+ 专注模式 */
export function buildQuickConfigMenuChildren(
    state: TitleBarQuickConfigState,
    handlers: TitleBarQuickConfigHandlers,
): TitleBarMenuItem[] {
    return [
        {
            id: 'config:preferences',
            labelKey: 'app.titleBar.menu.configQuick.preferences',
            kind: 'action',
            icon: 'settings',
            run: handlers.openPreferences,
        },
        divider('config:divider-panels'),
        toggleItem('config:side-rail', state.showSideRailStrip, handlers.toggleSideRailStrip, {
            icon: 'layout',
            labelKey: 'app.titleBar.menu.configQuick.navBar',
        }),
        toggleItem('config:explorer', state.showExplorerPanel, handlers.toggleExplorerPanel, {
            icon: 'tree',
            labelKey: 'app.titleBar.menu.configQuick.explorer',
        }),
        toggleItem('config:shortcut-rail', state.showShortcutRailStrip, handlers.toggleShortcutRailStrip, {
            icon: 'shortcuts',
            labelKey: 'app.titleBar.menu.configQuick.rightSidebar',
        }),
        divider('config:divider-focus'),
        {
            id: 'config:focus-mode',
            labelKey: 'app.titleBar.menu.configQuick.focusMode',
            kind: 'action',
            icon: 'console',
            run: handlers.applyFocusMode,
        },
    ]
}
