import {describe, it, beforeEach, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {
    canAccessFeature,
    createPreset,
    setActiveFeaturePermissions,
} from '@/features/auth/services/feature-permission.service'
import {
    canRunExplorerContextMenuAction,
    explorerContextMenuFeatureKey,
    filterExplorerContextMenuByPermission,
} from '@/features/explorer/services/explorer-context-menu-permission.service'
import {getContextMenuForNodeType} from '@/features/explorer/constants/context-menus'
import {buildConnectionLifecycleMenuItems, prependConnectionLifecycleMenu} from '@/features/explorer/services/explorer-connection-lifecycle.service'
import {toDbTypeMenuId} from '@/features/explorer/constants/explorer-add-menu'
import {toMoveTargetMenuId} from '@/features/explorer/services/explorer-move-connection.service'
import {setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'
import {persistSession} from '@/shared/auth/session'

const t = ((key: string) => key) as never

describe('explorer-context-menu-permission.service', () => {
    afterEach(() => {
        persistSession('session-user', 'admin', false, null, 1)
        setAppConfigStorageScope({userId: 1, userName: 'admin', isGuest: false})
        setActiveFeaturePermissions(createPreset('full'))
    })

    it('maps menu ids to grouped feature permissions', () => {
        assert.equal(
            explorerContextMenuFeatureKey('open'),
            FeaturePermission.WorkbenchExplorerContextOpen,
        )
        assert.equal(
            explorerContextMenuFeatureKey('delete'),
            FeaturePermission.WorkbenchExplorerContextDangerous,
        )
        assert.equal(
            explorerContextMenuFeatureKey('create-database'),
            FeaturePermission.WorkbenchExplorerContextEdit,
        )
        assert.equal(
            explorerContextMenuFeatureKey('create-schema'),
            FeaturePermission.WorkbenchExplorerContextEdit,
        )
        assert.equal(
            explorerContextMenuFeatureKey('delete-database'),
            FeaturePermission.WorkbenchExplorerContextDangerous,
        )
        assert.equal(
            explorerContextMenuFeatureKey(toDbTypeMenuId('mysql')),
            FeaturePermission.WorkbenchExplorerContextEdit,
        )
        assert.equal(
            explorerContextMenuFeatureKey(toMoveTargetMenuId('group-1')),
            FeaturePermission.WorkbenchExplorerContextEdit,
        )
    })

    it('workbench preset hides edit/export/dangerous tree actions', () => {
        setActiveFeaturePermissions(createPreset('workbench'))
        const tableMenu = filterExplorerContextMenuByPermission(getContextMenuForNodeType('table', t), {
            nodeType: 'table',
        })
        const ids = tableMenu.flatMap((item) => [
            item.id,
            ...(item.children?.map((child) => child.id) ?? []),
        ])
        assert.ok(ids.includes('open'))
        assert.ok(ids.includes('console'))
        assert.ok(ids.includes('copy-name'))
        assert.equal(ids.includes('delete'), false)
        assert.equal(ids.includes('truncate'), false)
        assert.equal(ids.includes('export-wizard'), false)
        assert.equal(canRunExplorerContextMenuAction('delete', {nodeType: 'table'}), false)
        assert.equal(canRunExplorerContextMenuAction('open'), true)
    })

    it('guest workbench preset keeps connection catalog edit/delete actions', () => {
        persistSession('session-guest', 'guest', true)
        setAppConfigStorageScope({isGuest: true})
        setActiveFeaturePermissions(createPreset('workbench'))
        const connectionMenu = filterExplorerContextMenuByPermission(
            prependConnectionLifecycleMenu(
                getContextMenuForNodeType('connection', t),
                buildConnectionLifecycleMenuItems(t, 'disconnected'),
            ),
            {nodeType: 'connection'},
        )
        const ids = connectionMenu.map((item) => item.id)
        assert.ok(ids.includes('edit'))
        assert.ok(ids.includes('delete'))
        assert.ok(ids.includes('create-database'))
        assert.ok(ids.includes('connect'))
        assert.ok(ids.includes('disconnect'))
        assert.equal(canRunExplorerContextMenuAction('connect', {nodeType: 'connection'}), true)
        assert.equal(canRunExplorerContextMenuAction('disconnect', {nodeType: 'connection'}), true)
        assert.equal(canRunExplorerContextMenuAction('delete', {nodeType: 'connection'}), true)
        assert.equal(canRunExplorerContextMenuAction('create-database', {nodeType: 'connection'}), true)
        assert.equal(canRunExplorerContextMenuAction('delete', {nodeType: 'table'}), false)
    })

    it('full preset keeps dangerous tree actions', () => {
        setActiveFeaturePermissions(createPreset('full'))
        const tableMenu = filterExplorerContextMenuByPermission(getContextMenuForNodeType('table', t), {
            nodeType: 'table',
        })
        const ids = tableMenu.map((item) => item.id)
        assert.ok(ids.includes('delete'))
        assert.equal(canAccessFeature(FeaturePermission.WorkbenchExplorerContextDangerous), true)
    })
})
