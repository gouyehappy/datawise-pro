import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import {
    connectionOpenLabel,
    createWorkspaceOpenDomain,
} from '@/features/workspace/stores/workspace-open.domain'

vi.mock('@/features/workspace/services/workspace-tab-touch', () => ({
    touchStatelessWorkspaceTab: vi.fn(),
}))

vi.mock('@/features/workspace/services/workspace-tab-id', () => ({
    nextWorkspaceTabId: (type: string) => `new-${type}`,
}))

describe('createWorkspaceOpenDomain', () => {
    it('connectionOpenLabel prefers explicit name then resolver', () => {
        expect(connectionOpenLabel('c1', 'Named', () => 'Resolved')).toBe('Named')
        expect(connectionOpenLabel('c1', undefined, () => 'Resolved')).toBe('Resolved')
    })

    it('openTab reuses and activates existing tab', async () => {
        const existing: WorkspaceTab = {
            id: 't1',
            title: 'Old',
            type: 'ssh-terminal',
            closable: true,
            connectionId: 'c1',
        }
        const tabs = ref<WorkspaceTab[]>([existing])
        const activeTabId = ref<string | null>(null)
        const domain = createWorkspaceOpenDomain({
            tabs,
            activeTabId,
            resolveConnectionLabel: () => 'Conn',
        })

        const id = domain.openTab(
            {reuse: existing, patches: {title: 'Patched'}},
            {connectionId: 'c1', kind: 'ssh'},
        )
        expect(id).toBe('t1')
        expect(activeTabId.value).toBe('t1')
        expect(existing.title).toBe('Patched')

        const {touchStatelessWorkspaceTab} = await import(
            '@/features/workspace/services/workspace-tab-touch'
        )
        expect(touchStatelessWorkspaceTab).toHaveBeenCalledWith('c1', 'ssh')
    })

    it('openWithPlan creates a new tab from plan decision', () => {
        const tabs = ref<WorkspaceTab[]>([])
        const activeTabId = ref<string | null>(null)
        const domain = createWorkspaceOpenDomain({
            tabs,
            activeTabId,
            resolveConnectionLabel: () => 'Conn',
        })

        const id = domain.openWithPlan(
            () => ({
                create: {
                    title: 'SSH',
                    type: 'ssh-terminal',
                    closable: true,
                    connectionId: 'c1',
                },
            }),
            {connectionId: 'c1'},
            'ssh',
        )
        expect(id).toBe('new-ssh-terminal')
        expect(tabs.value).toHaveLength(1)
        expect(activeTabId.value).toBe(id)
    })

    it('openSingletonTab reuses or creates terminal / data catalog', () => {
        const tabs = ref<WorkspaceTab[]>([])
        const activeTabId = ref<string | null>(null)
        const domain = createWorkspaceOpenDomain({
            tabs,
            activeTabId,
            resolveConnectionLabel: () => undefined,
        })

        const first = domain.openTerminal()
        expect(first).toBe('new-terminal')
        expect(domain.openTerminal()).toBe(first)
        expect(tabs.value).toHaveLength(1)

        const catalog = domain.openDataCatalog()
        expect(catalog).toBe('new-data-catalog')
        expect(tabs.value.map((t) => t.type)).toEqual(['terminal', 'data_catalog'])
    })

    it('openSchemaEr reuses by connection+database and patches focus table', () => {
        const tabs = ref<WorkspaceTab[]>([])
        const activeTabId = ref<string | null>(null)
        const domain = createWorkspaceOpenDomain({
            tabs,
            activeTabId,
            resolveConnectionLabel: () => undefined,
        })

        const id = domain.openSchemaEr({
            connectionId: 'c1',
            database: 'db1',
            focusTableName: 'orders',
        })
        expect(id).toBe('new-schema-er')
        expect(tabs.value[0]?.tableName).toBe('orders')

        const reused = domain.openSchemaEr({
            connectionId: 'c1',
            database: 'db1',
            instanceId: 'i2',
            focusTableName: 'items',
        })
        expect(reused).toBe(id)
        expect(tabs.value).toHaveLength(1)
        expect(tabs.value[0]?.instanceId).toBe('i2')
        expect(tabs.value[0]?.tableName).toBe('items')
    })

    it('openTable reuses by name/connection/relationKind', () => {
        const tabs = ref<WorkspaceTab[]>([])
        const activeTabId = ref<string | null>(null)
        const domain = createWorkspaceOpenDomain({
            tabs,
            activeTabId,
            resolveConnectionLabel: () => undefined,
        })

        const id = domain.openTable('orders', 'c1', 'i1', 'db1')
        expect(id).toBe('new-table')
        expect(domain.openTable('orders', 'c1', 'i1', 'db1', undefined, 'data')).toBe(id)
        expect(tabs.value).toHaveLength(1)
        expect(tabs.value[0]?.tableView).toBe('data')
    })
})
