import {computed, ref, type Ref} from 'vue'
import type {TreeNode} from '@/core/types'
import {buildAiTaggedScopeFlatNodes} from '@/features/ai/tag/services/ai-tagged-scope.service'
import type {AiTaggedScopeGroup} from '@/features/ai/tag/types/ai-table-tag.types'

export function useAiTaggedScopeTree(
    groups: Ref<AiTaggedScopeGroup[]>,
    search: Ref<string>,
    selectedIds: Ref<string[]>,
) {
    const collapsedIds = ref<Set<string>>(new Set())
    const databaseTableMap = computed(() => {
        const map = new Map<string, string[]>()
        for (const group of groups.value) {
            const dbNodeId = `aitag-d:${group.connectionId}:${group.database}`
            map.set(
                dbNodeId,
                group.tables.map((tableName) => `${group.connectionId}:${group.database}:${tableName}`),
            )
        }
        return map
    })
    const connectionTableMap = computed(() => {
        const map = new Map<string, string[]>()
        for (const group of groups.value) {
            const connNodeId = `aitag-c:${group.connectionId}`
            const existing = map.get(connNodeId) ?? []
            existing.push(
                ...group.tables.map((tableName) => `${group.connectionId}:${group.database}:${tableName}`),
            )
            map.set(connNodeId, existing)
        }
        return map
    })

    const flatNodes = computed(() =>
        buildAiTaggedScopeFlatNodes(groups.value, search.value, collapsedIds.value),
    )

    const visibleTableIds = computed(() =>
        flatNodes.value
            .filter(({node}) => node.type === 'table')
            .map(({node}) => node.id),
    )

    const allVisibleSelected = computed(() =>
        visibleTableIds.value.length > 0
        && visibleTableIds.value.every((id) => selectedIds.value.includes(id)),
    )

    function toggleExpand(nodeId: string) {
        const next = new Set(collapsedIds.value)
        if (next.has(nodeId)) next.delete(nodeId)
        else next.add(nodeId)
        collapsedIds.value = next
    }

    function isCheckable(node: TreeNode) {
        return node.type === 'table' || node.type === 'database' || node.type === 'connection'
    }

    function isChecked(node: TreeNode) {
        if (node.type === 'connection') {
            const ids = connectionTableMap.value.get(node.id) ?? []
            return ids.length > 0 && ids.every((id) => selectedIds.value.includes(id))
        }
        if (node.type === 'database') {
            const ids = databaseTableMap.value.get(node.id) ?? []
            return ids.length > 0 && ids.every((id) => selectedIds.value.includes(id))
        }
        return selectedIds.value.includes(node.id)
    }

    function resolveNodeTableIds(node: TreeNode): string[] {
        if (node.type === 'table') return [node.id]
        if (node.type === 'database') return databaseTableMap.value.get(node.id) ?? []
        if (node.type === 'connection') return connectionTableMap.value.get(node.id) ?? []
        return []
    }

    function toggleCheck(node: TreeNode) {
        const tableIds = resolveNodeTableIds(node)
        if (!tableIds.length) return
        const checked = tableIds.every((id) => selectedIds.value.includes(id))
        if (checked) {
            const removeSet = new Set(tableIds)
            selectedIds.value = selectedIds.value.filter((id) => !removeSet.has(id))
            return
        }
        selectedIds.value = Array.from(new Set([...selectedIds.value, ...tableIds]))
    }

    function selectAllVisible() {
        selectedIds.value = Array.from(new Set([...selectedIds.value, ...visibleTableIds.value]))
    }

    function clearVisible() {
        const visible = new Set(visibleTableIds.value)
        selectedIds.value = selectedIds.value.filter((id) => !visible.has(id))
    }

    return {
        flatNodes,
        allVisibleSelected,
        toggleExpand,
        isCheckable,
        isChecked,
        toggleCheck,
        selectAllVisible,
        clearVisible,
    }
}
