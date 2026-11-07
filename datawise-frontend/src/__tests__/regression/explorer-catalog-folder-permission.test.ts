import {describe, it, beforeEach, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {createPreset, setActiveFeaturePermissions} from '@/features/auth/services/feature-permission.service'
import {
    filterExplorerTreeCatalogFolders,
    isExplorerCatalogFolderVisible,
} from '@/features/explorer/services/explorer-catalog-folder-permission.service'

function databaseWithFolders(): TreeNode {
    return {
        id: 'db-1',
        label: 'admin_db',
        type: 'database',
        expanded: true,
        children: [
            {id: 'f-tables', label: 'tables', type: 'folder', children: []},
            {id: 'f-views', label: 'views', type: 'folder', children: []},
            {id: 'f-functions', label: 'functions', type: 'folder', children: []},
            {id: 'f-procedures', label: 'procedures', type: 'folder', children: []},
            {id: 'f-triggers', label: 'triggers', type: 'folder', children: []},
            {id: 'f-models', label: 'models', type: 'folder', children: []},
            {id: 'f-ws', label: 'workspaces', type: 'folder', children: []},
            {id: 'f-ai', label: 'ai', type: 'folder', children: []},
        ],
    }
}

describe('explorer-catalog-folder-permission.service', () => {
    afterEach(() => {
        setActiveFeaturePermissions(createPreset('full'))
    })

    it('workbench preset keeps schema folders and hides optional catalog folders', () => {
        setActiveFeaturePermissions(createPreset('workbench'))
        const filtered = filterExplorerTreeCatalogFolders([databaseWithFolders()], {
            showSemanticLayer: true,
        })
        const labels = filtered[0]?.children?.map((child) => child.label) ?? []
        assert.deepEqual(labels, ['tables', 'views', 'functions', 'procedures', 'triggers'])
        assert.equal(isExplorerCatalogFolderVisible('tables', {showSemanticLayer: true}), true)
        assert.equal(isExplorerCatalogFolderVisible('models', {showSemanticLayer: true}), false)
        assert.equal(isExplorerCatalogFolderVisible('workspaces', {showSemanticLayer: true}), false)
        assert.equal(isExplorerCatalogFolderVisible('ai', {showSemanticLayer: true}), false)
    })

    it('grants optional folders when catalog permissions are enabled', () => {
        setActiveFeaturePermissions({
            ...createPreset('workbench'),
            [FeaturePermission.WorkbenchExplorerCatalogModels]: true,
            [FeaturePermission.WorkbenchExplorerCatalogWorkspaces]: true,
            [FeaturePermission.WorkbenchExplorerCatalogAi]: true,
        })
        const filtered = filterExplorerTreeCatalogFolders([databaseWithFolders()], {
            showSemanticLayer: true,
        })
        const labels = filtered[0]?.children?.map((child) => child.label) ?? []
        assert.ok(labels.includes('models'))
        assert.ok(labels.includes('workspaces'))
        assert.ok(labels.includes('ai'))
    })

    it('hides AI folder when semantic layer preference is off even with permission', () => {
        setActiveFeaturePermissions({
            ...createPreset('workbench'),
            [FeaturePermission.WorkbenchExplorerCatalogAi]: true,
        })
        const filtered = filterExplorerTreeCatalogFolders([databaseWithFolders()], {
            showSemanticLayer: false,
        })
        const labels = filtered[0]?.children?.map((child) => child.label) ?? []
        assert.equal(labels.includes('ai'), false)
    })
})
