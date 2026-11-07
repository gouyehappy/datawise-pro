import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {buildQuickConfigMenuChildren} from '@/features/layout/services/title-bar-config-menu.service'
import {
    buildTitleBarNav,
    titleBarMenuHasChildren,
} from '@/features/layout/services/title-bar-nav.service'
import {
    createPreset,
    setActiveFeaturePermissions,
} from '@/features/auth/services/feature-permission.service'

const defaultConfigState = {
    showSideRailStrip: true,
    showExplorerPanel: true,
    showShortcutRailStrip: true,
}

const noopConfigHandlers = {
    openPreferences: () => {},
    toggleSideRailStrip: () => {},
    toggleExplorerPanel: () => {},
    toggleShortcutRailStrip: () => {},
    applyFocusMode: () => {},
}

const noopHandlers = {
    setModule: () => {},
    openSettings: () => {},
    openOnboarding: () => {},
    openRuntimeSetup: () => {},
    openNewConnection: () => {},
    openNewConsole: () => {},
    config: noopConfigHandlers,
}

describe('title-bar-config-menu.service', () => {
    it('builds a compact config menu with preferences, panel toggles, and focus mode', () => {
        const items = buildQuickConfigMenuChildren(defaultConfigState, noopConfigHandlers)
        const actionable = items.filter((item) => !item.divider)

        assert.deepEqual(
            actionable.map((item) => item.id),
            [
                'config:preferences',
                'config:side-rail',
                'config:explorer',
                'config:shortcut-rail',
                'config:focus-mode',
            ],
        )

        const explorer = items.find((item) => item.id === 'config:explorer')
        assert.equal(explorer?.labelKey, 'app.titleBar.menu.configQuick.explorer')
        assert.equal(explorer?.checked, true)

        const hidden = buildQuickConfigMenuChildren(
            {...defaultConfigState, showExplorerPanel: false},
            noopConfigHandlers,
        ).find((item) => item.id === 'config:explorer')
        assert.equal(hidden?.labelKey, 'app.titleBar.menu.configQuick.explorer')
        assert.equal(hidden?.checked, false)
    })
})

describe('title-bar-nav.service', () => {
    it('builds DBX-style action toolbar with config and help menus', () => {
        setActiveFeaturePermissions(createPreset('full'))
        const calls: string[] = []
        const menus = buildTitleBarNav(
            {
                activeModule: 'database',
                settingsSection: 'basic',
                config: defaultConfigState,
            },
            {
                ...noopHandlers,
                openNewConnection: () => calls.push('new-connection'),
                openNewConsole: () => calls.push('new-console'),
                config: {
                    ...noopConfigHandlers,
                    openPreferences: () => calls.push('open-settings'),
                },
            },
        )

        assert.deepEqual(
            menus.map((item) => item.id),
            ['new-connection', 'new-console', 'connectors', 'community-plugins', 'config', 'help'],
        )

        const config = menus.find((item) => item.id === 'config')
        assert.ok(config && titleBarMenuHasChildren(config))
        assert.ok(config!.children!.some((item) => item.id === 'config:preferences'))
        assert.ok(config!.children!.some((item) => item.id === 'config:focus-mode'))
        assert.ok(!config!.children!.some((item) => item.id === 'config:terminal'))
        assert.equal(config?.active, undefined)

        menus.find((item) => item.id === 'new-connection')?.run?.()
        menus.find((item) => item.id === 'new-console')?.run?.()
        config!.children!.find((item) => item.id === 'config:preferences')?.run?.()
        assert.deepEqual(calls, ['new-connection', 'new-console', 'open-settings'])
    })

    it('marks help menu active on about section', () => {
        setActiveFeaturePermissions(createPreset('full'))
        const menus = buildTitleBarNav(
            {
                activeModule: 'settings',
                settingsSection: 'about',
                config: defaultConfigState,
            },
            noopHandlers,
        )

        const help = menus.find((item) => item.id === 'help')
        assert.equal(help?.active, true)
    })

    it('keeps help menu to tour, runtime setup, and about', () => {
        setActiveFeaturePermissions(createPreset('full'))
        const menus = buildTitleBarNav(
            {
                activeModule: 'database',
                settingsSection: 'basic',
                config: defaultConfigState,
            },
            noopHandlers,
        )

        const help = menus.find((item) => item.id === 'help')
        assert.deepEqual(
            help?.children?.filter((item) => !item.divider).map((item) => item.id),
            ['help:onboarding', 'help:runtime-setup', 'help:about'],
        )
    })

    it('hides title bar items without permission', () => {
        setActiveFeaturePermissions(createPreset('workbench'))
        const menus = buildTitleBarNav(
            {
                activeModule: 'database',
                settingsSection: 'basic',
                config: defaultConfigState,
            },
            noopHandlers,
        )

        assert.deepEqual(menus.map((item) => item.id), ['new-connection', 'new-console'])
    })
})
