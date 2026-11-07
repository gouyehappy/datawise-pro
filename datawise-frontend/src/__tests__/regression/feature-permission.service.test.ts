import {describe, it, beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {
    canAccessFeature,
    canExecuteShortcutAction,
    canDeleteExplorerNode,
    canDeleteConnectionCatalogNode,
    canImportExplorerConnections,
    canMutateConnectionCatalog,
    canManageExplorerConnectionLifecycle,
    canOpenConnectionCatalogForm,
    canUseExplorerAddMenu,
    createPreset,
    detectPreset,
    normalizeFeaturePermissionMap,
    paletteNavigationEntryAllowed,
    setActiveFeaturePermissions,
    shortcutActionFeatureKey,
    sideRailFeatureKey,
} from '@/features/auth/services/feature-permission.service'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import type {FeaturePermissionKey} from '@/features/auth/types/feature-permission.types'
import {setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'
import {persistSession} from '@/shared/auth/session'

describe('feature-permission.service', () => {
    beforeEach(() => {
        persistSession('session-user', 'admin', false, null, 1)
        setAppConfigStorageScope({userId: 1, userName: 'admin', isGuest: false})
        setActiveFeaturePermissions(createPreset('full'))
    })

    it('workbench preset only grants database navigation', () => {
        const preset = createPreset('workbench')
        setActiveFeaturePermissions(preset)
        assert.equal(canAccessFeature(FeaturePermission.NavDatabase), true)
        assert.equal(canAccessFeature(FeaturePermission.NavDashboard), false)
        assert.equal(canAccessFeature(FeaturePermission.NavSettings), false)
    })

    it('workbench preset grants core console and explorer actions', () => {
        const preset = createPreset('workbench')
        setActiveFeaturePermissions(preset)
        assert.equal(canAccessFeature(FeaturePermission.WorkbenchConsoleRun), true)
        assert.equal(canAccessFeature(FeaturePermission.WorkbenchConsoleSave), false)
        assert.equal(canAccessFeature(FeaturePermission.WorkbenchExplorerSearch), true)
        assert.equal(canAccessFeature(FeaturePermission.WorkbenchExplorerContextOpen), true)
        assert.equal(canAccessFeature(FeaturePermission.WorkbenchExplorerContextDangerous), false)
    })

    it('detects full and workbench presets', () => {
        assert.equal(detectPreset(createPreset('full')), 'full')
        assert.equal(detectPreset(createPreset('workbench')), 'workbench')
    })

    it('maps side rail ids to feature keys', () => {
        assert.equal(sideRailFeatureKey('database'), FeaturePermission.NavDatabase)
        assert.equal(sideRailFeatureKey('terminal'), FeaturePermission.UtilTerminal)
        assert.equal(sideRailFeatureKey('assistant'), FeaturePermission.NavAi)
        assert.equal(sideRailFeatureKey('notify'), FeaturePermission.UtilNotify)
    })

    it('normalizes sparse permission maps for admin UI', () => {
        const normalized = normalizeFeaturePermissionMap({
            [FeaturePermission.WorkbenchExplorerAdd]: true,
        })
        assert.equal(normalized[FeaturePermission.WorkbenchExplorerAdd], true)
        assert.equal(normalized[FeaturePermission.NavDatabase], true)
        assert.equal(normalized[FeaturePermission.NavDashboard], false)
    })

    it('maps shortcut actions to feature permissions', () => {
        assert.equal(shortcutActionFeatureKey('explorer.deleteNode'), FeaturePermission.WorkbenchExplorerContextDangerous)
        assert.equal(shortcutActionFeatureKey('app.globalObjectSearch'), null)
        assert.equal(shortcutActionFeatureKey('app.toggleAssistant'), FeaturePermission.NavAi)
    })

    it('blocks shortcut execution without permission', () => {
        setActiveFeaturePermissions(createPreset('workbench'))
        assert.equal(canExecuteShortcutAction('explorer.deleteNode'), false)
        assert.equal(canExecuteShortcutAction('explorer.refresh'), true)
        assert.equal(canExecuteShortcutAction('app.globalObjectSearch'), true)
    })

    it('allows guest catalog shortcuts without dangerous permission', () => {
        persistSession('session-guest', 'guest', true)
        setAppConfigStorageScope({isGuest: true})
        setActiveFeaturePermissions(createPreset('workbench'))
        assert.equal(canExecuteShortcutAction('explorer.deleteNode'), true)
        assert.equal(canExecuteShortcutAction('explorer.editNode'), true)
    })

    it('filters palette navigation entries by permission', () => {
        const can = (key: FeaturePermissionKey) => key === FeaturePermission.NavDatabase
        const canNav = (module: string) => module === 'database'
        assert.equal(paletteNavigationEntryAllowed('module:database', can, canNav as never), true)
        assert.equal(paletteNavigationEntryAllowed('module:settings', can, canNav as never), false)
        assert.equal(paletteNavigationEntryAllowed('action:new-console', can, canNav as never), false)
    })

    it('allows guests to open connection catalog form', () => {
        persistSession('session-guest', 'guest', true)
        setAppConfigStorageScope({isGuest: true})
        setActiveFeaturePermissions(createPreset('workbench'))
        assert.equal(canOpenConnectionCatalogForm(true), true)
        assert.equal(canMutateConnectionCatalog(true), true)
        assert.equal(canDeleteConnectionCatalogNode(true), true)
        assert.equal(canDeleteExplorerNode('connection', true), true)
        assert.equal(canDeleteExplorerNode('table', true), false)
        assert.equal(canUseExplorerAddMenu(true), true)
        assert.equal(canImportExplorerConnections(true), false)
        assert.equal(canManageExplorerConnectionLifecycle(true), true)
    })

    it('requires explorer context edit for registered users', () => {
        assert.equal(canOpenConnectionCatalogForm(false), true)
        setActiveFeaturePermissions(createPreset('readonly'))
        assert.equal(canAccessFeature(FeaturePermission.WorkbenchExplorerContextEdit), false)
        assert.equal(canOpenConnectionCatalogForm(false), false)
        assert.equal(canMutateConnectionCatalog(false), false)
        assert.equal(canDeleteExplorerNode('connection', false), false)
        assert.equal(canUseExplorerAddMenu(false), false)
        assert.equal(canImportExplorerConnections(false), false)

        setActiveFeaturePermissions({
            ...createPreset('readonly'),
            [FeaturePermission.WorkbenchExplorerContextEdit]: true,
        })
        assert.equal(canOpenConnectionCatalogForm(false), true)
        assert.equal(canMutateConnectionCatalog(false), true)

        setActiveFeaturePermissions({
            ...createPreset('readonly'),
            [FeaturePermission.WorkbenchExplorerAdd]: true,
        })
        assert.equal(canUseExplorerAddMenu(false), true)
        assert.equal(canMutateConnectionCatalog(false), true)
        assert.equal(canOpenConnectionCatalogForm(false), true)

        setActiveFeaturePermissions({
            ...createPreset('readonly'),
            [FeaturePermission.WorkbenchExplorerContextConnection]: true,
        })
        assert.equal(canManageExplorerConnectionLifecycle(false), true)

        setActiveFeaturePermissions({
            ...createPreset('readonly'),
            [FeaturePermission.WorkbenchExplorerContextDangerous]: true,
        })
        assert.equal(canDeleteExplorerNode('connection', false), true)

        setActiveFeaturePermissions({
            ...createPreset('workbench'),
            [FeaturePermission.WorkbenchExplorerContextExport]: true,
        })
        assert.equal(canImportExplorerConnections(false), true)
    })
})
