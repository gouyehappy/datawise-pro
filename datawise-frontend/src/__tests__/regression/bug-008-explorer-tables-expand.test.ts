import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {canExpandTreeNode} from '@/core/utils/tree'
import {needsLazyLoad} from '@/features/explorer/services/explorer-lazy-load'
import {isExplorerInfoNode} from '@/features/explorer/services/explorer-node-info.service'

function node(partial: Partial<TreeNode> & Pick<TreeNode, 'id' | 'label' | 'type'>): TreeNode {
    return {...partial}
}

describe('BUG-008 explorer tables expand', () => {
    it('tables folder still needs lazy load after database folders are present', () => {
        const tablesFolder = node({
            id: 'folder-tables-conn-1-admin_db',
            label: 'tables',
            type: 'folder',
            children: [],
        })

        assert.equal(canExpandTreeNode(tablesFolder), true)
        assert.equal(needsLazyLoad(tablesFolder), true)
        assert.equal(isExplorerInfoNode(tablesFolder), false)
    })

    it('views folder is expandable and lazy-loads view models', () => {
        const viewsFolder = node({
            id: 'folder-views-conn-1-a003',
            label: 'views',
            type: 'folder',
            children: [],
        })

        assert.equal(canExpandTreeNode(viewsFolder), true)
        assert.equal(needsLazyLoad(viewsFolder), true)
    })

    it('ai folder is expandable and lazy-loads platform features', () => {
        const aiFolder = node({
            id: 'folder-ai-conn-1-admin_db',
            label: 'ai',
            type: 'folder',
            children: [],
        })

        assert.equal(canExpandTreeNode(aiFolder), true)
        assert.equal(needsLazyLoad(aiFolder), true)
    })

    it('platform_feature nodes are leaf entries', () => {
        const featureNode = node({
            id: 'pf-conn-1-admin_db-semantic_metrics',
            label: 'semantic_metrics',
            type: 'platform_feature',
            meta: 'semantic_metrics',
        })
        assert.equal(canExpandTreeNode(featureNode), false)
    })

    it('functions, procedures, and triggers folders show expand arrows', () => {
        for (const label of ['functions', 'procedures', 'triggers'] as const) {
            const folder = node({
                id: `folder-${label}-conn-1-admin_db`,
                label,
                type: 'folder',
                children: [],
            })
            assert.equal(canExpandTreeNode(folder), true, `${label} should be expandable`)
        }
    })
})
