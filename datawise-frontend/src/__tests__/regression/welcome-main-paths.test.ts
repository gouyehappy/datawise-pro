import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    WELCOME_COMMON_ACTIONS,
    WELCOME_MAIN_PATHS,
    collectWelcomeConnections,
    collectWelcomeNewestConnections,
    countWelcomeConnected,
    countWelcomeDbTypes,
    filterWelcomeCommonActions,
    filterWelcomeMainPaths,
    leadCopyKey,
    preferredWelcomePath,
    summarizeSqlPreview,
} from '@/features/workspace/services/welcome-main-paths.service'

describe('welcome-main-paths', () => {
    it('keeps exactly three canonical main paths', () => {
        assert.deepEqual(
            WELCOME_MAIN_PATHS.map((path) => path.id),
            ['explore', 'sql', 'ai'],
        )
    })

    it('filters main paths by capability', () => {
        const paths = filterWelcomeMainPaths({
            canCreateConnection: true,
            canNewConsole: false,
            canAi: true,
        })
        assert.deepEqual(paths.map((path) => path.id), ['explore', 'ai'])
    })

    it('filters common actions by capability', () => {
        const actions = filterWelcomeCommonActions({
            canCreateConnection: true,
            canNewConsole: true,
            canHistory: false,
            canImport: true,
            canAi: false,
        })
        assert.deepEqual(
            actions.map((action) => action.id),
            ['newConnection', 'newConsole', 'import'],
        )
    })

    it('keeps a stable common-action catalog', () => {
        assert.deepEqual(
            WELCOME_COMMON_ACTIONS.map((action) => action.id),
            ['newConnection', 'newConsole', 'history', 'import', 'ai'],
        )
    })

    it('collects connections and db-type stats from the explorer tree', () => {
        const tree: TreeNode[] = [
            {
                id: 'c1',
                label: 'StarRocks@1',
                type: 'connection',
                dbType: 'starrocks',
                children: [],
            },
            {
                id: 'g1',
                label: 'group',
                type: 'group',
                children: [
                    {
                        id: 'c2',
                        label: 'Hive@2',
                        type: 'connection',
                        dbType: 'hive',
                        meta: '10.0.0.1',
                        children: [],
                    },
                    {
                        id: 'c3',
                        label: 'Hive@3',
                        type: 'connection',
                        dbType: 'hive',
                        children: [],
                    },
                ],
            },
        ]
        assert.equal(countWelcomeDbTypes(tree), 2)
        assert.deepEqual(
            collectWelcomeConnections(tree, 2).map((row) => row.id),
            ['c1', 'c2'],
        )
        assert.equal(countWelcomeConnected(new Set(['c1', 'c2'])), 2)
    })

    it('orders welcome connections by recent ids then tree order', () => {
        const tree: TreeNode[] = [
            {
                id: 'c1',
                label: 'A',
                type: 'connection',
                dbType: 'mysql',
                children: [],
            },
            {
                id: 'c2',
                label: 'Plugin',
                type: 'connection',
                dbType: 'plugin',
                pluginId: 'kibana',
                children: [],
            },
            {
                id: 'c3',
                label: 'C',
                type: 'connection',
                dbType: 'postgres',
                children: [],
            },
        ]
        const rows = collectWelcomeConnections(tree, 2, ['c3', 'missing', 'c2'])
        assert.deepEqual(rows.map((row) => row.id), ['c3', 'c2'])
        assert.equal(rows[1]?.pluginId, 'kibana')
    })

    it('orders newest connections by added ids then reverse tree order', () => {
        const tree: TreeNode[] = [
            {
                id: 'c1',
                label: 'A',
                type: 'connection',
                dbType: 'mysql',
                children: [],
            },
            {
                id: 'c2',
                label: 'B',
                type: 'connection',
                dbType: 'hive',
                children: [],
            },
            {
                id: 'c3',
                label: 'C',
                type: 'connection',
                dbType: 'postgres',
                children: [],
            },
        ]
        assert.deepEqual(
            collectWelcomeNewestConnections(tree, 2, ['c1']).map((row) => row.id),
            ['c1', 'c3'],
        )
        assert.deepEqual(
            collectWelcomeNewestConnections(tree, 2).map((row) => row.id),
            ['c3', 'c2'],
        )
    })

    it('summarizes sql for history preview', () => {
        assert.equal(summarizeSqlPreview('select   1'), 'select 1')
        assert.ok(summarizeSqlPreview('a'.repeat(100), 20).endsWith('…'))
    })

    it('highlights explore for an empty workspace and SQL when connections exist', () => {
        assert.equal(preferredWelcomePath(WELCOME_MAIN_PATHS, false), 'explore')
        assert.equal(preferredWelcomePath(WELCOME_MAIN_PATHS, true), 'sql')
        assert.equal(leadCopyKey(false), 'welcome.lead')
        assert.equal(leadCopyKey(true), 'welcome.leadReturning')
    })
})
