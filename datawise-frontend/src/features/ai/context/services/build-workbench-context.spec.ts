import {describe, expect, it} from 'vitest'
import {buildWorkbenchContextSnapshot} from '@/features/ai/context/services/build-workbench-context'
import type {TreeNode, WorkspaceTab} from '@/core/types'
import {WORKBENCH_CONTEXT_BODY_MAX} from '@/features/ai/context/types/workbench-context.types'

describe('buildWorkbenchContextSnapshot', () => {
    const tree: TreeNode[] = [
        {
            id: 'g1',
            label: 'Dev',
            type: 'group',
            children: [
                {
                    id: 'c1',
                    label: 'Orders DB',
                    type: 'connection',
                    dbType: 'mysql',
                    env: 'prod',
                    database: 'orders',
                    children: [
                        {
                            id: 'db1',
                            label: 'orders',
                            type: 'database',
                            children: [
                                {id: 't1', label: 'line_items', type: 'table'},
                            ],
                        },
                    ],
                },
            ],
        },
    ]

    it('captures active console tab and focus connection', () => {
        const tabs: WorkspaceTab[] = [
            {
                id: 'tab-1',
                title: 'SQL',
                type: 'console',
                closable: true,
                connectionId: 'c1',
                database: 'orders',
                dbType: 'mysql',
                sql: 'select 1',
            },
        ]
        const snap = buildWorkbenchContextSnapshot({
            tabs,
            activeTab: tabs[0],
            explorerTree: tree,
            selectedNodeId: 't1',
            layoutModule: 'database',
        })
        expect(snap.online).toBe(true)
        expect(snap.focus.connectionId).toBe('c1')
        expect(snap.focus.connectionName).toBe('Orders DB')
        expect(snap.focus.database).toBe('orders')
        expect(snap.focus.environment).toBe('prod')
        expect(snap.activeTab?.bodyPreview).toBe('select 1')
        expect(snap.openTabs).toHaveLength(1)
        expect(snap.selection?.explorerPath?.at(-1)).toBe('line_items')
    })

    it('truncates long SQL body preview', () => {
        const sql = 'a'.repeat(WORKBENCH_CONTEXT_BODY_MAX + 10)
        const tab: WorkspaceTab = {
            id: 'tab-1',
            title: 'SQL',
            type: 'console',
            closable: true,
            connectionId: 'c1',
            sql,
        }
        const snap = buildWorkbenchContextSnapshot({
            tabs: [tab],
            activeTab: tab,
            explorerTree: tree,
            selectedNodeId: null,
        })
        expect(snap.activeTab?.bodyPreview?.length).toBe(WORKBENCH_CONTEXT_BODY_MAX)
        expect(snap.activeTab?.bodyTruncated).toBe(true)
        expect(snap.activeTab?.bodyLength).toBe(sql.length)
        expect(snap.activeTab?.bodyTruncation).toEqual({
            truncated: true,
            originalLength: sql.length,
            limit: WORKBENCH_CONTEXT_BODY_MAX,
            unit: 'chars',
            reason: 'preview',
        })
    })
})
