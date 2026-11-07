import {describe, it, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {
    filterExplorerAddMenuItems,
    getExplorerAddMenuItems,
} from '@/features/explorer/constants/explorer-add-menu'
import {
    canImportExplorerConnections,
    canUseExplorerAddMenu,
    createPreset,
    setActiveFeaturePermissions,
} from '@/features/auth/services/feature-permission.service'
import {persistSession} from '@/shared/auth/session'
import {setAppConfigStorageScope} from '@/shared/config/app-config-storage-scope'

const t = ((key: string) => key) as never

describe('explorer-add-menu', () => {
    afterEach(() => {
        persistSession('session-user', 'admin', false, null, 1)
        setAppConfigStorageScope({userId: 1, userName: 'admin', isGuest: false})
        setActiveFeaturePermissions(createPreset('full'))
    })

    it('guest workbench preset shows folder and connection but not import', () => {
        persistSession('session-guest', 'guest', true)
        setAppConfigStorageScope({isGuest: true})
        setActiveFeaturePermissions(createPreset('workbench'))

        assert.equal(canUseExplorerAddMenu(true), true)
        assert.equal(canImportExplorerConnections(true), false)

        const ids = filterExplorerAddMenuItems(getExplorerAddMenuItems(t), true).map((item) => item.id)
        assert.ok(ids.includes('new-folder'))
        assert.ok(ids.includes('add-connection'))
        assert.equal(ids.includes('import-connections'), false)
        assert.equal(ids.includes('export-project-connections'), false)
    })

    it('registered readonly preset without add permission hides toolbar menu', () => {
        setActiveFeaturePermissions(createPreset('readonly'))
        assert.equal(canUseExplorerAddMenu(false), false)
        assert.equal(filterExplorerAddMenuItems(getExplorerAddMenuItems(t), false).length, 0)
    })

    it('full preset keeps import for registered users', () => {
        setActiveFeaturePermissions(createPreset('full'))
        assert.equal(canUseExplorerAddMenu(false), true)
        assert.equal(canImportExplorerConnections(false), true)

        const ids = filterExplorerAddMenuItems(getExplorerAddMenuItems(t), false).map((item) => item.id)
        assert.ok(ids.includes('import-connections'))
        assert.ok(ids.includes('export-project-connections'))
    })
})
