/** Package copy: @datawise/chrome installOverlayScrollbarHosts. Host file kept until cutover. */
/**
 * 全局把常见滚动根升级为 Monaco / 资源树同款自绘叠加条。
 *
 * 跳过：数据网格滚动根、DwOverlayScroll 视口、Monaco、xterm、祖先已挂载的子级。
 * 新区域也可：`<DwOverlayScroll>` 或 `data-overlay-scroll`。
 */
import {
    attachOverlayScrollbar,
    detachOverlayScrollbar,
    isOverlayScrollbarAttached,
} from './attachOverlayScrollbar'

/**
 * 数据网格（.grid-body / .dw-data-grid__body）不挂自绘条：
 * 虚拟行 + sticky 表头下，轨插在滚动根内并用 transform 钉视口时，
 * 滑块易与真实 scrollHeight 脱节（看起来「条在、拖不动 / 滚不动」）。
 * 网格走 installAutohideScrollbar 原生细条。
 */
export const OVERLAY_SCROLLBAR_HOST_SELECTOR = [
    '.dw-scrollbar-autohide',
    '[data-overlay-scroll]',
    '.messages-log',
    '.overview',
    '.error-pane',
    '.exec-result-pane',
    '.explain-plan__body',
    '.explain-graph',
    '.result-diff__table-wrap',
    '.dw-embedded-panel',
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

let installed = false

/** 网格若仍挂着旧自绘轨，卸掉并恢复原生条 */
const GRID_SCROLL_ROOT_SELECTOR = '.grid-body, .dw-data-grid__body'

function detachGridOverlayHosts(root: ParentNode = document) {
    root.querySelectorAll?.(GRID_SCROLL_ROOT_SELECTOR).forEach((el) => {
        if (el instanceof HTMLElement && isOverlayScrollbarAttached(el)) {
            detachOverlayScrollbar(el)
        }
    })
}

function tryAttach(node: Element | null) {
    if (!(node instanceof HTMLElement)) return
    if (node.matches(GRID_SCROLL_ROOT_SELECTOR)) {
        if (isOverlayScrollbarAttached(node)) detachOverlayScrollbar(node)
        return
    }
    if (!node.matches(OVERLAY_SCROLLBAR_HOST_SELECTOR)) return
    attachOverlayScrollbar(node)
}

function tryDetachTree(node: Node) {
    if (!(node instanceof Element)) return
    if (node instanceof HTMLElement && isOverlayScrollbarAttached(node)) {
        detachOverlayScrollbar(node)
    }
    node.querySelectorAll?.('.dw-overlay-scroll-target').forEach((el) => {
        if (el instanceof HTMLElement) detachOverlayScrollbar(el)
    })
}

function scan(root: ParentNode = document) {
    detachGridOverlayHosts(root)
    root.querySelectorAll?.(OVERLAY_SCROLLBAR_HOST_SELECTOR).forEach((el) => tryAttach(el))
}

export function installOverlayScrollbarHosts() {
    if (typeof document === 'undefined') return
    // 每次调用都卸网格残留轨（含 HMR）；完整扫描只装一次
    detachGridOverlayHosts(document)
    if (installed) return
    installed = true

    const boot = () => scan(document)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, {once: true})
    } else {
        boot()
    }
    requestAnimationFrame(() => requestAnimationFrame(boot))

    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                m.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return
                    tryAttach(node)
                    scan(node)
                })
                m.removedNodes.forEach((node) => tryDetachTree(node))
            } else if (m.type === 'attributes' && m.target instanceof Element) {
                tryAttach(m.target)
            }
        }
    })

    mo.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
    })

    document.addEventListener(
        'scroll',
        (event) => {
            const target = event.target
            if (target instanceof HTMLElement) tryAttach(target)
        },
        {capture: true, passive: true},
    )
}

// HMR：模块重载时立刻卸掉网格上旧自绘轨
if (typeof document !== 'undefined') {
    detachGridOverlayHosts(document)
}
