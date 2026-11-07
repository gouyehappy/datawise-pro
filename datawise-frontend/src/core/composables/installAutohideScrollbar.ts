/**
 * 原生滚动条增强：
 * 1) is-scrolling — 滚轮/拖拽时显示滑块
 * 2) is-sb-hot — 指针靠近右/下边缘（滚动条热区）时加宽滑块
 *
 * 热区常驻 10px（好点中），默认可视约 4px；靠近边缘再「胀」到满热区，
 * 无需先点中 4px 细线，也不会整表悬停就变粗，且无布局跳动。
 */

const DEFAULT_HIDE_MS = 900
/** 距右/下边多少 px 算「靠近滚动条」 */
const EDGE_HOT_PX = 14

/** 须与 scrollbars.css 中 autohide :is(...) 列表对齐 */
export const AUTOHIDE_SCROLLBAR_SELECTOR = [
    '.dw-scrollbar-autohide',
    '.grid-body',
    '.dw-data-grid__body',
    '.dw-embedded-panel',
    '.messages-log',
    '.overview',
    '.error-pane',
    '.exec-result-pane',
    '.explain-plan__body',
    '.explain-graph',
    '.result-diff__table-wrap',
    '.dw-workbench-table-shell',
    '.conn-body',
    '.conn-preview',
    '.connector-browse-panel__pane',
    '.nacos-list__scroll',
    '.connector-list__scroll',
    '.resizable-table-wrap',
    '.chat-scroll',
    '.dw-log-viewer__text',
    '.module-shell__main',
    '.module-shell__nav-list',
    '.module-page--scroll',
    '.mp-panel__body--scroll',
    '.ws-switcher__body',
    '.shortcut-cheatsheet__body',
    '.mru-switcher__list',
    '.modal-drawer-body',
    '.app-palette__list',
    '.grid-form-view__scroll',
    '.db-type-panel__nav',
    '.db-type-panel__body',
    '.lf-md-toc__list',
    '.ssh-quick-ops__body',
    '.mock-terminal__output',
    '.ai-sessions-list',
    '.ai-sessions-detail',
    '.shared-ai-viewer__messages',
    '.community-plugin-list-pane__scroll',
    '.connector-market-page',
    '.connector-market-nav',
    '.connector-market-split__detail',
    '.plugin-dev-table-wrap',
    '.pack-audit__list',
    '.migration-panel__tab-body',
    '.migration-panel__log-box',
    '.admin-panel__table-wrap',
    '.kb-entry-sidebar__list',
    '.kb-entry-editor',
].join(',')

const hideTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()
let installed = false
let hotEl: HTMLElement | null = null
let hotRaf = 0
let pendingX = 0
let pendingY = 0

function clearHot() {
    if (!hotEl) return
    hotEl.classList.remove('is-sb-hot')
    hotEl = null
}

function setHot(next: HTMLElement | null) {
    if (hotEl === next) return
    if (hotEl) hotEl.classList.remove('is-sb-hot')
    hotEl = next
    if (hotEl) hotEl.classList.add('is-sb-hot')
}

function canScrollV(el: HTMLElement) {
    return el.scrollHeight > el.clientHeight + 1
}

function canScrollH(el: HTMLElement) {
    return el.scrollWidth > el.clientWidth + 1
}

function resolveHotTarget(x: number, y: number): HTMLElement | null {
    const node = document.elementFromPoint(x, y)
    if (!(node instanceof Element)) return null
    const host = node.closest(AUTOHIDE_SCROLLBAR_SELECTOR)
    if (!(host instanceof HTMLElement)) return null
    if (host.classList.contains('dw-overlay-scroll-target--armed')) return null

    const rect = host.getBoundingClientRect()
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null

    const nearV = canScrollV(host) && x >= rect.right - EDGE_HOT_PX
    const nearH = canScrollH(host) && y >= rect.bottom - EDGE_HOT_PX
    return nearV || nearH ? host : null
}

function flushHot() {
    hotRaf = 0
    setHot(resolveHotTarget(pendingX, pendingY))
}

export function installAutohideScrollbar(hideAfterMs = DEFAULT_HIDE_MS) {
    if (installed || typeof document === 'undefined') return
    installed = true

    document.addEventListener(
        'scroll',
        (event: Event) => {
            const target = event.target
            if (!(target instanceof HTMLElement)) return
            if (target.classList.contains('dw-overlay-scroll__viewport')) return
            if (target.classList.contains('dw-overlay-scroll-target--armed')) return
            if (!target.matches(AUTOHIDE_SCROLLBAR_SELECTOR)) return

            target.classList.add('is-scrolling')
            const prev = hideTimers.get(target)
            if (prev) clearTimeout(prev)
            hideTimers.set(
                target,
                setTimeout(() => {
                    target.classList.remove('is-scrolling')
                    hideTimers.delete(target)
                }, hideAfterMs),
            )
        },
        {capture: true, passive: true},
    )

    document.addEventListener(
        'pointermove',
        (event: PointerEvent) => {
            pendingX = event.clientX
            pendingY = event.clientY
            if (hotRaf) return
            hotRaf = requestAnimationFrame(flushHot)
        },
        {capture: true, passive: true},
    )

    document.addEventListener(
        'pointerleave',
        () => {
            if (hotRaf) {
                cancelAnimationFrame(hotRaf)
                hotRaf = 0
            }
            clearHot()
        },
        true,
    )
}
