import {computed, onMounted, onUnmounted, ref, type Ref} from 'vue'
import type {TreeNode} from '@/core/types'

export const EXPLORER_TREE_ROW_HEIGHT = 28
export const EXPLORER_TREE_VIRTUAL_THRESHOLD = 80
const VIRTUAL_BUFFER_ROWS = 8

export type FlatTreeEntry<T = TreeNode> = {node: T; depth: number}

export type VisibleFlatTreeEntry<T = TreeNode> = FlatTreeEntry<T> & {index: number}

/** 与选中高亮一致：同一 nodeId 在 flat 列表中只高亮最后一次出现 */
export function resolveLastFlatNodeIndex<T extends {id: string}>(
    flatNodes: readonly FlatTreeEntry<T>[],
    nodeId: string | null | undefined,
): number {
    if (!nodeId) return -1
    let last = -1
    for (let index = 0; index < flatNodes.length; index += 1) {
        if (flatNodes[index].node.id === nodeId) {
            last = index
        }
    }
    return last
}

export type TreeVirtualWindowOptions = {
    rowHeight?: number
    /** CSS selector for scroll parent; default `.explorer-body`. */
    scrollParentSelector?: string
}

/**
 * 大树虚拟窗口：滚动容器默认为最近的 `.explorer-body`。
 * 低于阈值时退化为全量渲染。
 */
export function useTreeVirtualWindow<T = TreeNode>(
    flatNodes: Ref<FlatTreeEntry<T>[]>,
    options: TreeVirtualWindowOptions | number = EXPLORER_TREE_ROW_HEIGHT,
) {
    const opts =
        typeof options === 'number'
            ? {rowHeight: options, scrollParentSelector: '.explorer-body'}
            : {
                rowHeight: options.rowHeight ?? EXPLORER_TREE_ROW_HEIGHT,
                scrollParentSelector: options.scrollParentSelector ?? '.explorer-body',
            }
    const rowHeight = opts.rowHeight

    const rootRef = ref<HTMLElement | null>(null)
    const scrollTop = ref(0)
    const viewportHeight = ref(0)
    let scrollParent: HTMLElement | null = null
    let resizeObserver: ResizeObserver | null = null

    const useVirtual = computed(
        () => flatNodes.value.length >= EXPLORER_TREE_VIRTUAL_THRESHOLD,
    )

    const totalHeight = computed(() => flatNodes.value.length * rowHeight)

    const visibleRange = computed(() => {
        const total = flatNodes.value.length
        if (!useVirtual.value || total === 0) {
            return {start: 0, end: total, paddingTop: 0, paddingBottom: 0}
        }
        const start = Math.max(
            0,
            Math.floor(scrollTop.value / rowHeight) - VIRTUAL_BUFFER_ROWS,
        )
        const visibleRows =
            Math.ceil(viewportHeight.value / rowHeight) + VIRTUAL_BUFFER_ROWS * 2
        const end = Math.min(total, start + visibleRows)
        return {
            start,
            end,
            paddingTop: start * rowHeight,
            paddingBottom: Math.max(0, (total - end) * rowHeight),
        }
    })

    const visibleNodes = computed((): VisibleFlatTreeEntry<T>[] => {
        const {start, end} = visibleRange.value
        return flatNodes.value.slice(start, end).map((entry, offset) => ({
            ...entry,
            index: start + offset,
        }))
    })

    const visibleRangePaddingTop = computed(() => visibleRange.value.paddingTop)
    const visibleRangePaddingBottom = computed(() => visibleRange.value.paddingBottom)

    function syncViewport() {
        if (!scrollParent) return
        scrollTop.value = scrollParent.scrollTop
        viewportHeight.value = scrollParent.clientHeight
    }

    function scrollToFlatIndex(index: number, behavior: ScrollBehavior = 'smooth') {
        if (!scrollParent || index < 0) return
        const target = Math.max(0, index * rowHeight - scrollParent.clientHeight / 3)
        scrollParent.scrollTo({top: target, behavior})
        syncViewport()
    }

    onMounted(() => {
        const root = rootRef.value
        if (!root) return
        scrollParent = root.closest(opts.scrollParentSelector) as HTMLElement | null
        if (!scrollParent) return
        syncViewport()
        scrollParent.addEventListener('scroll', syncViewport, {passive: true})
        resizeObserver = new ResizeObserver(syncViewport)
        resizeObserver.observe(scrollParent)
    })

    onUnmounted(() => {
        scrollParent?.removeEventListener('scroll', syncViewport)
        resizeObserver?.disconnect()
        resizeObserver = null
        scrollParent = null
    })

    return {
        rootRef,
        useVirtual,
        totalHeight,
        visibleNodes,
        visibleRangePaddingTop,
        visibleRangePaddingBottom,
        scrollToFlatIndex,
    }
}
