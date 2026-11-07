import {beforeEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createPinia, setActivePinia} from 'pinia'

vi.mock('@/features/datasource/stores/datasource-catalog', () => ({
    useDatasourceCatalogStore: () => ({
        items: [],
        ensureLoaded: vi.fn().mockResolvedValue(undefined),
    }),
}))

import {useConnectionTree} from '@/features/explorer/composables/useConnectionTree'
import type {TreeNode} from '@/core/types'


let tree: ReturnType<typeof useConnectionTree> | null = null

const Host = defineComponent({
    setup() {
        tree = useConnectionTree()
        return () => null
    },
})

function mountTree() {
    setActivePinia(createPinia())
    const i18n = createI18n({
        locale: 'en',
        messages: {en: {}},
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
    })
    return mount(Host, {
        global: {
            plugins: [createPinia(), i18n],
        },
    })
}

function connectionNode(overrides: Partial<TreeNode> = {}): TreeNode {
    return {
        id: 'conn-1',
        label: 'MySQL',
        type: 'connection',
        children: [],
        ...overrides,
    } as TreeNode
}

describe('useConnectionTree baseline', () => {
    beforeEach(() => {
        tree = null
        mountTree()
    })

    it('exposes the composable surface used by the explorer tree', () => {
        expect(tree).not.toBeNull()
        for (const key of [
            'explorer',
            'flatNodes',
            'menuVisible',
            'menuPos',
            'menuItems',
            'onSelect',
            'onOpen',
            'onContextMenu',
            'onMenuSelect',
            'closeMenu',
            'treeInline',
            'beginCreateRootGroup',
            'confirmDeleteDatabase',
            'performMoveConnection',
            'connectionDragEnabled',
        ] as const) {
            expect(key in tree!).toBe(true)
        }
    })

    it('onSelect selects a connection node', async () => {
        const node = connectionNode()
        await tree!.onSelect(node)
        expect(tree!.explorer.selectedNodeId).toBe('conn-1')
    })

    it('onOpen routes connection nodes through the explorer store', async () => {
        const node = connectionNode()
        const connect = vi.spyOn(tree!.explorer, 'connectConnection').mockResolvedValue(undefined)
        await tree!.onOpen(node)
        expect(connect).toHaveBeenCalledWith('conn-1', {notify: true})
        expect(tree!.explorer.selectedNodeId).toBe('conn-1')
    })

    it('onContextMenu opens the menu for a connection node', async () => {
        const node = connectionNode()
        const event = {preventDefault: vi.fn(), clientX: 10, clientY: 20} as unknown as MouseEvent
        tree!.onContextMenu(event, node)
        expect(tree!.menuVisible.value).toBe(true)
        expect(tree!.menuItems.value.length).toBeGreaterThan(0)
    })
})
