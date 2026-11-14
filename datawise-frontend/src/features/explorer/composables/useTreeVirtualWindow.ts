import {computed, onMounted, onUnmounted, ref, type Ref} from 'vue'
import type {TreeNode} from '@/core/types'
import {
    isDocumentHidden,
    scheduleAfterForegroundSettle,
    shouldApplyViewportSample,
    type ViewportSample,
} from '@/shared/browser/foreground-settle'

export const EXPLORER_TREE_ROW_HEIGHT = 28
export const EXPLORER_TREE_VIRTUAL_THRESHOLD = 80
const VIRTUAL_BUFFER_ROWS = 8
/** 尚无稳定 clientHeight 时的估测屏高（行数），避免 0 高度窗口塌缩 */
const FALLBACK_VIEWPORT_ROWS = 24

export type FlatTreeEntry<T = TreeNode> = {node: T; depth: number}

export type VisibleFlatTreeEntry<T = TreeNode> = FlatTreeEntry<T> & {index: number}

export type TreeViewportSample = ViewportSample

/** @deprecated 使用 shared/browser/foreground-settle.shouldApplyViewportSample */
export const shouldApplyTreeViewportSample = shouldApplyViewportSample

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
 * 大树虚拟窗口（连接树 / 本地文件树共用）。
 * 视口采样走全局 foreground-settle 门闩，避免切回窗口时瞬态 0 高度导致闪跳。
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
    let syncRaf = 0
    let cancelResume: (() => void) | null = null

    const useVirtual = computed(
        () => flatNodes.value.length >= EXPLORER_TREE_VIRTUAL_THRESHOLD,
    )

    const totalHeight = computed(() => flatNodes.value.length * rowHeight)

    const visibleRange = computed(() => {
        const total = flatNodes.value.length
        if (!useVirtual.value || total === 0) {
            return {start: 0, end: total, paddingTop: 0, paddingBottom: 0}
        }
        const height =
            viewportHeight.value > 0
                ? viewportHeight.value
                : rowHeight * FALLBACK_VIEWPORT_ROWS
        const start = Math.max(
            0,
            Math.floor(scrollTop.value / rowHeight) - VIRTUAL_BUFFER_ROWS,
        )
        const visibleRows =
            Math.ceil(height / rowHeight) + VIRTUAL_BUFFER_ROWS * 2
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

    function readSample(): ViewportSample | null {
        if (!scrollParent) return null
        return {
            scrollTop: scrollParent.scrollTop,
            viewportHeight: scrollParent.clientHeight,
        }
    }

    function applySample(sample: ViewportSample) {
        scrollTop.value = sample.scrollTop
        viewportHeight.value = sample.viewportHeight
    }

    function syncViewport(force = false) {
        const sample = readSample()
        if (!sample) return
        const previous = {
            scrollTop: scrollTop.value,
            viewportHeight: viewportHeight.value,
        }
        if (
            !force
            && !shouldApplyViewportSample(sample, previous, {
                documentHidden: isDocumentHidden(),
            })
        ) {
            return
        }
        if (force && sample.viewportHeight <= 0 && previous.viewportHeight > 0) {
            return
        }
        applySample(sample)
    }

    function scheduleSync() {
        if (syncRaf) return
        syncRaf = requestAnimationFrame(() => {
            syncRaf = 0
            syncViewport()
        })
    }

    function resumeAfterForeground() {
        cancelResume?.()
        cancelResume = scheduleAfterForegroundSettle(() => {
            cancelResume = null
            const sample = readSample()
            if (!sample || sample.viewportHeight <= 0) return
            const prevH = viewportHeight.value
            if (prevH > 0 && Math.abs(sample.viewportHeight - prevH) < 2) {
                if (Math.abs(sample.scrollTop - scrollTop.value) >= 1) {
                    scrollTop.value = sample.scrollTop
                }
                return
            }
            syncViewport(true)
        })
    }

    function onVisibilityChange() {
        if (isDocumentHidden()) return
        resumeAfterForeground()
    }

    function scrollToFlatIndex(index: number, behavior: ScrollBehavior = 'smooth') {
        if (!scrollParent || index < 0) return
        const height = scrollParent.clientHeight || viewportHeight.value
        const target = Math.max(0, index * rowHeight - height / 3)
        scrollParent.scrollTo({top: target, behavior})
        syncViewport(true)
    }

    onMounted(() => {
        const root = rootRef.value
        if (!root) return
        scrollParent = root.closest(opts.scrollParentSelector) as HTMLElement | null
        if (!scrollParent) return
        syncViewport(true)
        scrollParent.addEventListener('scroll', scheduleSync, {passive: true})
        resizeObserver = new ResizeObserver(scheduleSync)
        resizeObserver.observe(scrollParent)
        document.addEventListener('visibilitychange', onVisibilityChange)
    })

    onUnmounted(() => {
        scrollParent?.removeEventListener('scroll', scheduleSync)
        resizeObserver?.disconnect()
        resizeObserver = null
        scrollParent = null
        if (syncRaf) cancelAnimationFrame(syncRaf)
        cancelResume?.()
        document.removeEventListener('visibilitychange', onVisibilityChange)
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
