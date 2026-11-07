import {nextTick, onMounted, onUnmounted, ref, watch, type Ref} from 'vue'

export type TitleBarMenuDensity = 'full' | 'ctx-compact' | 'ctx-overflow' | 'nav-compact'

export const TITLE_BAR_DENSITY_STEPS: TitleBarMenuDensity[] = [
    'full',
    'ctx-compact',
    'ctx-overflow',
    'nav-compact',
]

export interface TitleBarMenuLayoutStats {
    primaryCount: number
    contextItemCount: number
    contextGroupCount: number
}

const DRAG_MIN = 24
const HYSTERESIS = 56

/** 宽度启发式（单测用） */
export function densityForWidth(width: number): TitleBarMenuDensity {
    if (width >= 1180) return 'full'
    if (width >= 920) return 'ctx-compact'
    if (width >= 680) return 'ctx-overflow'
    return 'nav-compact'
}

/** 估算各密度下菜单内容占用宽度（px） */
export function estimateTitleBarContentWidth(
    density: TitleBarMenuDensity,
    stats: TitleBarMenuLayoutStats,
): number {
    const primaryUnit = density === 'nav-compact' ? 28 : 66
    const primary = stats.primaryCount * primaryUnit

    if (stats.contextItemCount === 0) {
        return primary
    }

    if (density === 'ctx-overflow' || density === 'nav-compact') {
        const overflowBtn = density === 'nav-compact' ? 28 : 88
        return primary + 14 + overflowBtn
    }

    const contextUnit = density === 'full' ? 74 : 26
    const groupLabel = density === 'full' ? 0 : stats.contextGroupCount * 18
    const context = stats.contextItemCount * contextUnit + groupLabel + 14 * stats.contextGroupCount
    return primary + context
}

function fitsBudget(content: HTMLElement, budget: number): boolean {
    return content.scrollWidth <= budget + 2
}

/** 根据预算与统计量选取最宽松且能放下的密度（带滞后，避免边界抖动） */
export function pickTitleBarMenuDensity(
    budget: number,
    stats: TitleBarMenuLayoutStats,
    previous: TitleBarMenuDensity,
): TitleBarMenuDensity {
    const previousIdx = TITLE_BAR_DENSITY_STEPS.indexOf(previous)

    for (let i = 0; i < TITLE_BAR_DENSITY_STEPS.length; i++) {
        const step = TITLE_BAR_DENSITY_STEPS[i]
        const width = estimateTitleBarContentWidth(step, stats)
        const expanding = i < previousIdx
        const threshold = expanding ? width + HYSTERESIS : width
        if (threshold <= budget) {
            return step
        }
    }

    return 'nav-compact'
}

/** 顶栏菜单随容器宽度紧凑；仅观察容器，避免密度切换反馈循环 */
export function useTitleBarMenuDensity(
    containerRef: Ref<HTMLElement | null>,
    contentRef: Ref<HTMLElement | null>,
    statsRef: Ref<TitleBarMenuLayoutStats>,
    remeasureKey?: Ref<unknown>,
) {
    const density = ref<TitleBarMenuDensity>('full')
    let reconcileToken = 0

    async function reconcileDensity() {
        const token = ++reconcileToken
        const container = containerRef.value
        const content = contentRef.value
        if (!container) return

        const budget = Math.max(160, container.clientWidth - DRAG_MIN)
        const next = pickTitleBarMenuDensity(budget, statsRef.value, density.value)

        if (density.value !== next) {
            density.value = next
        }

        if (!content) return

        await nextTick()
        if (token !== reconcileToken) return
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
        })
        if (token !== reconcileToken) return

        // 估算偏差时最多再降一级，不回弹
        if (!fitsBudget(content, budget)) {
            const idx = TITLE_BAR_DENSITY_STEPS.indexOf(density.value)
            const tighter = TITLE_BAR_DENSITY_STEPS[Math.min(idx + 1, TITLE_BAR_DENSITY_STEPS.length - 1)]
            if (tighter !== density.value) {
                density.value = tighter
            }
        }
    }

    let resizeObserver: ResizeObserver | null = null
    let rafId = 0

    function scheduleReconcile() {
        cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
            void reconcileDensity()
        })
    }

    function bindObserver() {
        resizeObserver?.disconnect()
        resizeObserver = null
        const container = containerRef.value
        if (!container) return
        resizeObserver = new ResizeObserver(scheduleReconcile)
        resizeObserver.observe(container)
        scheduleReconcile()
    }

    onMounted(bindObserver)
    onUnmounted(() => {
        resizeObserver?.disconnect()
        cancelAnimationFrame(rafId)
    })

    watch(containerRef, bindObserver)
    watch(statsRef, scheduleReconcile, {deep: true})
    if (remeasureKey) {
        watch(remeasureKey, scheduleReconcile)
    }

    return {density, reconcileDensity}
}
